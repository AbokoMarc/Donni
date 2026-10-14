package com.donni.api.notifications;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.donni.api.common.ApiException;
import com.donni.api.devices.Device;
import com.donni.api.devices.DeviceRepository;
import com.donni.api.sync.SyncNotifier;

@Service
public class NotificationService implements SyncNotifier {

    public static final List<String> PREFERENCE_TYPES = List.of("login_new_device", "sync_available", "account_security");

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final FcmService fcm;
    private final DeviceRepository devices;
    private final RemoteNotificationRepository notifications;
    private final NotificationPreferenceRepository preferences;
    private final ExecutorService executor;
    private final Clock clock;

    public NotificationService(FcmService fcm, DeviceRepository devices, RemoteNotificationRepository notifications,
                               NotificationPreferenceRepository preferences, ExecutorService backgroundExecutor,
                               Clock clock) {
        this.fcm = fcm;
        this.devices = devices;
        this.notifications = notifications;
        this.preferences = preferences;
        this.executor = backgroundExecutor;
        this.clock = clock;
    }

    public boolean fcmEnabled() {
        return fcm.enabled();
    }

    public void loginNewDevice(UUID userId) {
        pushLater(userId, "login_new_device", "Nouvelle connexion",
                "Votre compte DONNI vient d'être utilisé sur un nouvel appareil.");
    }

    public void accountSecurity(UUID userId, String body) {
        pushLater(userId, "account_security", "Sécurité du compte", body);
    }

    @Override
    public void changesApplied(UUID userId) {
        if (!fcm.enabled()) {
            return;
        }
        executor.execute(() -> guarded(() -> {
            if (!isEnabled(userId, "sync_available")) {
                return;
            }
            for (Device device : devices.findByUserId(userId)) {
                handleOutcome(device, fcm.sendData(device.getFcmToken(), Map.of("type", "sync_available")));
            }
        }));
    }

    /** Envoi synchrone, réservé à la route de test. */
    public RemoteNotification sendTest(UUID userId) {
        if (!fcm.enabled()) {
            throw ApiException.unavailable("service_unavailable", "Les notifications FCM ne sont pas configurées");
        }
        List<Device> targets = devices.findByUserId(userId);
        if (targets.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "no_device", "Aucun appareil enregistré");
        }
        return deliver(userId, targets, "test", "Notification de test", "Les notifications DONNI fonctionnent.");
    }

    public boolean isEnabled(UUID userId, String type) {
        return preferences.findById(new NotificationPreference.Key(userId, "fcm", type))
                .map(NotificationPreference::isEnabled).orElse(true);
    }

    private void pushLater(UUID userId, String type, String title, String body) {
        if (!fcm.enabled()) {
            return;
        }
        executor.execute(() -> guarded(() -> {
            if (!isEnabled(userId, type)) {
                return;
            }
            List<Device> targets = devices.findByUserId(userId);
            if (!targets.isEmpty()) {
                deliver(userId, targets, type, title, body);
            }
        }));
    }

    private RemoteNotification deliver(UUID userId, List<Device> targets, String type, String title, String body) {
        RemoteNotification record = notifications.save(
                new RemoteNotification(userId, type, title, body, Map.of(), clock.instant()));
        Map<String, String> data = Map.of("type", type, "notificationId", record.getId().toString());
        int sent = 0;
        for (Device device : targets) {
            FcmService.Outcome outcome = fcm.send(device.getFcmToken(), title, body, data);
            handleOutcome(device, outcome);
            if (outcome == FcmService.Outcome.SENT) {
                sent++;
            }
        }
        if (sent > 0) {
            record.markSent(clock.instant());
        } else {
            record.markFailed("Aucun appareil joignable");
        }
        return notifications.save(record);
    }

    private void handleOutcome(Device device, FcmService.Outcome outcome) {
        if (outcome == FcmService.Outcome.INVALID_TOKEN) {
            devices.deleteByFcmToken(device.getFcmToken());
        }
    }

    private void guarded(Runnable task) {
        try {
            task.run();
        } catch (RuntimeException e) {
            log.warn("Notification distante abandonnée : {}", e.getClass().getSimpleName());
        }
    }
}
