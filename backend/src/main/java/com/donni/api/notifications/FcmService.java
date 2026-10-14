package com.donni.api.notifications;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.donni.api.config.DonniProperties;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;

import jakarta.annotation.PreDestroy;

@Service
public class FcmService {

    public enum Outcome { SENT, INVALID_TOKEN, FAILED }

    private static final Logger log = LoggerFactory.getLogger(FcmService.class);

    private final FirebaseApp app;
    private final FirebaseMessaging messaging;

    public FcmService(DonniProperties properties) {
        FirebaseApp created = null;
        FirebaseMessaging client = null;
        DonniProperties.Fcm fcm = properties.fcm();
        if (fcm != null && fcm.configured()) {
            try {
                ServiceAccountCredentials credentials = ServiceAccountCredentials.newBuilder()
                        .setClientEmail(fcm.clientEmail().strip())
                        .setPrivateKey(parsePrivateKey(fcm.privateKey()))
                        .setProjectId(fcm.projectId().strip())
                        .build();
                FirebaseOptions options = FirebaseOptions.builder()
                        .setCredentials(credentials)
                        .setProjectId(fcm.projectId().strip())
                        .build();
                created = FirebaseApp.initializeApp(options, "donni");
                client = FirebaseMessaging.getInstance(created);
                log.info("FCM actif pour le projet {}", fcm.projectId().strip());
            } catch (GeneralSecurityException | RuntimeException e) {
                log.error("FCM désactivé : identifiants inutilisables ({})", e.getClass().getSimpleName());
            }
        } else {
            log.info("FCM inactif : FCM_PROJECT_ID, FCM_CLIENT_EMAIL et FCM_PRIVATE_KEY ne sont pas tous définis");
        }
        this.app = created;
        this.messaging = client;
    }

    public boolean enabled() {
        return messaging != null;
    }

    public Outcome send(String token, String title, String body, Map<String, String> data) {
        Message message = Message.builder()
                .setToken(token)
                .setNotification(com.google.firebase.messaging.Notification.builder().setTitle(title).setBody(body).build())
                .putAllData(data)
                .setAndroidConfig(AndroidConfig.builder().setPriority(AndroidConfig.Priority.HIGH).build())
                .build();
        return deliver(message);
    }

    public Outcome sendData(String token, Map<String, String> data) {
        Message message = Message.builder()
                .setToken(token)
                .putAllData(data)
                .setAndroidConfig(AndroidConfig.builder().setPriority(AndroidConfig.Priority.HIGH).build())
                .build();
        return deliver(message);
    }

    @PreDestroy
    void shutdown() {
        if (app != null) {
            app.delete();
        }
    }

    private Outcome deliver(Message message) {
        try {
            messaging.send(message);
            return Outcome.SENT;
        } catch (FirebaseMessagingException e) {
            MessagingErrorCode code = e.getMessagingErrorCode();
            if (code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT) {
                return Outcome.INVALID_TOKEN;
            }
            log.warn("Envoi FCM refusé : {}", code);
            return Outcome.FAILED;
        } catch (RuntimeException e) {
            log.warn("Envoi FCM impossible : {}", e.getClass().getSimpleName());
            return Outcome.FAILED;
        }
    }

    static PrivateKey parsePrivateKey(String raw) throws GeneralSecurityException {
        String pem = raw.strip();
        if (pem.length() > 1 && pem.startsWith("\"") && pem.endsWith("\"")) {
            pem = pem.substring(1, pem.length() - 1);
        }
        pem = pem.replace("\\n", "\n")
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        byte[] der = Base64.getDecoder().decode(pem);
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
    }
}
