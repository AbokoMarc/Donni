package com.donni.api.notifications;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.donni.api.common.ApiException;
import com.donni.api.security.AccessTokenService;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    public record NotificationView(UUID id, String channel, String type, String title, String body,
                                   Map<String, Object> data, String status, Instant createdAt, Instant sentAt,
                                   Instant readAt) {

        static NotificationView of(RemoteNotification n) {
            return new NotificationView(n.getId(), n.getChannel(), n.getType(), n.getTitle(), n.getBody(), n.getData(),
                    n.getStatus(), n.getCreatedAt(), n.getSentAt(), n.getReadAt());
        }
    }

    public record PreferenceView(String channel, String type, boolean enabled) {
    }

    private final NotificationService service;
    private final RemoteNotificationRepository notifications;
    private final NotificationPreferenceRepository preferences;
    private final Clock clock;

    public NotificationController(NotificationService service, RemoteNotificationRepository notifications,
                                  NotificationPreferenceRepository preferences, Clock clock) {
        this.service = service;
        this.notifications = notifications;
        this.preferences = preferences;
        this.clock = clock;
    }

    @GetMapping
    public List<NotificationView> history(@AuthenticationPrincipal Jwt jwt,
                                          @RequestParam(defaultValue = "50") int limit,
                                          @RequestParam(required = false) String before) {
        if (limit < 1 || limit > 100) {
            throw ApiException.validation("limit", "Entier entre 1 et 100 attendu");
        }
        Instant upper = clock.instant().plus(Duration.ofDays(1));
        if (before != null) {
            try {
                upper = Instant.parse(before);
            } catch (DateTimeParseException e) {
                throw ApiException.validation("before", "Date et heure ISO 8601 attendues");
            }
        }
        return notifications.page(AccessTokenService.userId(jwt), upper, PageRequest.of(0, limit)).stream()
                .map(NotificationView::of).toList();
    }

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        RemoteNotification notification = notifications.findByIdAndUserId(id, AccessTokenService.userId(jwt))
                .orElseThrow(ApiException::notFound);
        notification.markRead(clock.instant());
    }

    @GetMapping("/preferences")
    public List<PreferenceView> preferences(@AuthenticationPrincipal Jwt jwt) {
        return currentPreferences(AccessTokenService.userId(jwt));
    }

    @PutMapping("/preferences")
    @Transactional
    public List<PreferenceView> updatePreferences(@AuthenticationPrincipal Jwt jwt,
                                                  @RequestBody List<PreferenceView> requested) {
        UUID userId = AccessTokenService.userId(jwt);
        Map<String, String> errors = new LinkedHashMap<>();
        for (int i = 0; i < requested.size(); i++) {
            PreferenceView item = requested.get(i);
            if (item == null || !"fcm".equals(item.channel()) || !NotificationService.PREFERENCE_TYPES.contains(item.type())) {
                errors.put("[" + i + "]", "Canal ou type inconnu");
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        for (PreferenceView item : requested) {
            NotificationPreference.Key key = new NotificationPreference.Key(userId, item.channel(), item.type());
            NotificationPreference existing = preferences.findById(key).orElse(null);
            if (existing == null) {
                preferences.save(new NotificationPreference(userId, item.channel(), item.type(), item.enabled()));
            } else {
                existing.setEnabled(item.enabled());
            }
        }
        return currentPreferences(userId);
    }

    @PostMapping("/test")
    public NotificationView test(@AuthenticationPrincipal Jwt jwt) {
        return NotificationView.of(service.sendTest(AccessTokenService.userId(jwt)));
    }

    private List<PreferenceView> currentPreferences(UUID userId) {
        Map<String, Boolean> stored = new LinkedHashMap<>();
        preferences.findByUser(userId).stream().filter(p -> "fcm".equals(p.getId().getChannel()))
                .forEach(p -> stored.put(p.getId().getType(), p.isEnabled()));
        List<PreferenceView> out = new ArrayList<>();
        for (String type : NotificationService.PREFERENCE_TYPES) {
            out.add(new PreferenceView("fcm", type, stored.getOrDefault(type, true)));
        }
        return out;
    }
}
