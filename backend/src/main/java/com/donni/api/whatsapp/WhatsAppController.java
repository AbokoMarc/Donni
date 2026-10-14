package com.donni.api.whatsapp;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.donni.api.auth.User;
import com.donni.api.auth.UserRepository;
import com.donni.api.common.ApiException;
import com.donni.api.common.Hashing;
import com.donni.api.config.DonniProperties;
import com.donni.api.security.AccessTokenService;

@RestController
@RequestMapping("/api/v1")
public class WhatsAppController {

    private final WhatsAppService whatsApp;
    private final WebhookService webhooks;
    private final ReminderDispatcher dispatcher;
    private final UserRepository users;
    private final DonniProperties properties;

    public WhatsAppController(WhatsAppService whatsApp, WebhookService webhooks, ReminderDispatcher dispatcher,
                              UserRepository users, DonniProperties properties) {
        this.whatsApp = whatsApp;
        this.webhooks = webhooks;
        this.dispatcher = dispatcher;
        this.users = users;
        this.properties = properties;
    }

    @GetMapping("/whatsapp/status")
    public Map<String, String> status() {
        return Map.of("mode", whatsApp.mode());
    }

    @PostMapping("/whatsapp/test")
    public Map<String, String> test(@AuthenticationPrincipal Jwt jwt) {
        requireAvailable();
        User user = users.findById(AccessTokenService.userId(jwt)).orElseThrow(ApiException::unauthorized);
        try {
            String providerId = whatsApp.send(user.getId(), user.getPhone(), WhatsAppTemplate.TEST, List.of());
            return Map.of("providerId", providerId);
        } catch (WhatsAppException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "whatsapp_failed", "L'envoi WhatsApp a échoué");
        }
    }

    @GetMapping(value = "/webhooks/whatsapp", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> verify(@RequestParam(name = "hub.mode", required = false) String mode,
                                         @RequestParam(name = "hub.verify_token", required = false) String token,
                                         @RequestParam(name = "hub.challenge", required = false) String challenge) {
        boolean valid = "subscribe".equals(mode) && challenge != null
                && Hashing.constantTimeEquals(properties.whatsapp().verifyToken(), token)
                && !properties.whatsapp().verifyToken().isEmpty();
        return valid ? ResponseEntity.ok(challenge) : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PostMapping(value = "/webhooks/whatsapp", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Void> receive(@RequestBody byte[] body,
                                        @RequestHeader(name = "X-Hub-Signature-256", required = false) String signature) {
        String secret = properties.whatsapp().appSecret();
        if (secret == null || secret.isEmpty()) {
            throw ApiException.unavailable("service_unavailable", "Webhook WhatsApp non configuré");
        }
        if (!WebhookSignature.verify(body, signature, secret)) {
            throw ApiException.forbidden();
        }
        webhooks.applyStatuses(body);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/internal/whatsapp/dispatch")
    public Map<String, Integer> dispatch(@RequestHeader(name = "X-Dispatch-Token", required = false) String token) {
        String expected = properties.dispatchToken();
        if (expected == null || expected.isEmpty()) {
            throw ApiException.notFound();
        }
        if (!Hashing.constantTimeEquals(expected, token)) {
            throw ApiException.forbidden();
        }
        requireAvailable();
        ReminderDispatcher.Result result = dispatcher.dispatch();
        return Map.of("sent", result.sent(), "failed", result.failed());
    }

    private void requireAvailable() {
        if (!whatsApp.available()) {
            throw ApiException.unavailable("service_unavailable", "WhatsApp est désactivé");
        }
    }
}
