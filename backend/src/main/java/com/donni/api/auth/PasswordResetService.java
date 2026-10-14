package com.donni.api.auth;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.donni.api.common.ApiException;
import com.donni.api.common.Hashing;
import com.donni.api.common.PhoneNumbers;
import com.donni.api.notifications.NotificationService;
import com.donni.api.whatsapp.WhatsAppService;
import com.donni.api.whatsapp.WhatsAppTemplate;

@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final Duration CODE_LIFETIME = Duration.ofMinutes(10);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final PasswordResetRepository resets;
    private final RefreshTokenService refreshTokens;
    private final TokenHasher hasher;
    private final PasswordEncoder encoder;
    private final WhatsAppService whatsApp;
    private final NotificationService notifications;
    private final Clock clock;

    public PasswordResetService(UserRepository users, PasswordResetRepository resets, RefreshTokenService refreshTokens,
                                TokenHasher hasher, PasswordEncoder encoder, WhatsAppService whatsApp,
                                NotificationService notifications, Clock clock) {
        this.users = users;
        this.resets = resets;
        this.refreshTokens = refreshTokens;
        this.hasher = hasher;
        this.encoder = encoder;
        this.whatsApp = whatsApp;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional
    public void requestCode(String phone) {
        if (!whatsApp.available()) {
            throw ApiException.unavailable("reset_channel_unavailable",
                    "La réinitialisation par WhatsApp n'est pas disponible");
        }
        String normalized = PhoneNumbers.normalize(phone)
                .orElseThrow(() -> ApiException.validation("phone", "Numéro invalide"));
        User user = users.findByPhone(normalized).filter(User::isActive).orElse(null);
        if (user == null) {
            return;
        }
        Instant now = clock.instant();
        boolean recent = resets.findFirstByUserIdOrderByCreatedAtDesc(user.getId())
                .map(last -> last.getCreatedAt().plus(RESEND_COOLDOWN).isAfter(now)).orElse(false);
        if (recent) {
            return;
        }
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        resets.save(new PasswordReset(user.getId(), codeHash(user, code), now, now.plus(CODE_LIFETIME)));
        try {
            whatsApp.send(user.getId(), user.getPhone(), WhatsAppTemplate.RESET_CODE, List.of(code));
        } catch (RuntimeException e) {
            log.warn("Envoi du code de réinitialisation impossible : {}", e.getClass().getSimpleName());
        }
    }

    @Transactional(noRollbackFor = ApiException.class)
    public void reset(String phone, String code, String newPassword) {
        Map<String, String> errors = new LinkedHashMap<>();
        String normalized = PhoneNumbers.normalize(phone).orElse(null);
        if (normalized == null) {
            errors.put("phone", "Numéro invalide");
        }
        AuthService.checkPassword(newPassword, "newPassword", errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        Instant now = clock.instant();
        User user = users.findByPhone(normalized).filter(User::isActive).orElseThrow(PasswordResetService::invalidCode);
        PasswordReset reset = resets.findTopByUserIdOrderByCreatedAtDesc(user.getId()).filter(r -> r.isOpen(now))
                .orElseThrow(PasswordResetService::invalidCode);
        reset.recordAttempt();
        if (!Hashing.constantTimeEquals(reset.getCodeHash(), codeHash(user, code.strip()))) {
            throw invalidCode();
        }
        reset.markUsed(now);
        user.setPasswordHash(encoder.encode(newPassword));
        refreshTokens.revokeAllExcept(user.getId(), null);
        notifications.accountSecurity(user.getId(), "Votre mot de passe DONNI a été réinitialisé.");
    }

    private String codeHash(User user, String code) {
        return hasher.hash(user.getId() + ":" + code);
    }

    private static ApiException invalidCode() {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid_reset_code", "Code invalide ou expiré");
    }
}
