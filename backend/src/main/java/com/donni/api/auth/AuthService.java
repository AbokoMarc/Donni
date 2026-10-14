package com.donni.api.auth;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.donni.api.auth.Dtos.AuthResponse;
import com.donni.api.auth.Dtos.MeResponse;
import com.donni.api.auth.Dtos.UserSummary;
import com.donni.api.common.ApiException;
import com.donni.api.common.PhoneNumbers;
import com.donni.api.notifications.NotificationService;
import com.donni.api.security.AccessTokenService;

@Service
public class AuthService {

    private static final int MAX_PASSWORD_BYTES = 72;

    private final UserRepository users;
    private final RefreshTokenService refreshTokens;
    private final AccessTokenService accessTokens;
    private final PasswordEncoder encoder;
    private final NotificationService notifications;
    private final Clock clock;
    private final String unknownUserHash;

    public AuthService(UserRepository users, RefreshTokenService refreshTokens, AccessTokenService accessTokens,
                       PasswordEncoder encoder, NotificationService notifications, Clock clock) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.accessTokens = accessTokens;
        this.encoder = encoder;
        this.notifications = notifications;
        this.clock = clock;
        this.unknownUserHash = encoder.encode("absent-user-placeholder");
    }

    @Transactional
    public AuthResponse register(String fullName, String phone, String password, UUID deviceId) {
        Map<String, String> errors = new LinkedHashMap<>();
        String name = fullName.strip();
        if (name.length() < 2) {
            errors.put("fullName", "Entre 2 et 80 caractères");
        }
        String normalized = PhoneNumbers.normalize(phone).orElse(null);
        if (normalized == null) {
            errors.put("phone", "Numéro invalide");
        }
        checkPassword(password, "password", errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        if (users.findByPhone(normalized).isPresent()) {
            throw phoneTaken();
        }
        User user;
        try {
            user = users.saveAndFlush(new User(name, normalized, encoder.encode(password)));
        } catch (DataIntegrityViolationException e) {
            throw phoneTaken();
        }
        return startSession(user, deviceId);
    }

    @Transactional
    public AuthResponse login(String phone, String password, UUID deviceId) {
        User user = PhoneNumbers.normalize(phone).flatMap(users::findByPhone).orElse(null);
        boolean matches = encoder.matches(password, user == null ? unknownUserHash : user.getPasswordHash());
        if (user == null || !matches || !user.isActive()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "Numéro ou mot de passe incorrect");
        }
        boolean newDevice = deviceId != null && !refreshTokens.knowsDevice(user.getId(), deviceId);
        user.setLastLoginAt(clock.instant());
        AuthResponse response = startSession(user, deviceId);
        if (newDevice) {
            notifications.loginNewDevice(user.getId());
        }
        return response;
    }

    @Transactional(noRollbackFor = ApiException.class)
    public AuthResponse refresh(String refreshToken) {
        RefreshTokenService.Issued issued = refreshTokens.rotate(refreshToken);
        User user = users.findById(issued.userId()).filter(User::isActive).orElse(null);
        if (user == null) {
            refreshTokens.revokeAllExcept(issued.userId(), null);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Session invalide");
        }
        return response(user, issued);
    }

    public void logout(String refreshToken) {
        refreshTokens.revoke(refreshToken);
    }

    @Transactional
    public void changePassword(UUID userId, UUID sessionId, String currentPassword, String newPassword) {
        User user = users.findById(userId).orElseThrow(ApiException::unauthorized);
        if (!encoder.matches(currentPassword, user.getPasswordHash())) {
            throw ApiException.validation("currentPassword", "Mot de passe actuel incorrect");
        }
        Map<String, String> errors = new LinkedHashMap<>();
        checkPassword(newPassword, "newPassword", errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        user.setPasswordHash(encoder.encode(newPassword));
        refreshTokens.revokeAllExcept(userId, sessionId);
        notifications.accountSecurity(userId, "Votre mot de passe DONNI a été modifié.");
    }

    @Transactional
    public void deleteAccount(UUID userId, String password) {
        User user = users.findById(userId).orElseThrow(ApiException::unauthorized);
        if (!encoder.matches(password, user.getPasswordHash())) {
            throw ApiException.validation("password", "Mot de passe incorrect");
        }
        users.delete(user);
    }

    public MeResponse me(UUID userId) {
        User user = users.findById(userId).filter(User::isActive).orElseThrow(ApiException::unauthorized);
        return new MeResponse(user.getId(), user.getFullName(), user.getPhone(), user.getCreatedAt());
    }

    static void checkPassword(String password, String field, Map<String, String> errors) {
        if (password.length() < 8) {
            errors.put(field, "8 caractères minimum");
        } else if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            errors.put(field, "72 caractères au plus");
        }
    }

    private AuthResponse startSession(User user, UUID deviceId) {
        refreshTokens.purgeExpired(user.getId());
        return response(user, refreshTokens.issue(user.getId(), null, deviceId));
    }

    private AuthResponse response(User user, RefreshTokenService.Issued issued) {
        return new AuthResponse(accessTokens.issue(user.getId(), issued.familyId()), issued.token(),
                accessTokens.expiresInSeconds(), new UserSummary(user.getId(), user.getFullName(), user.getPhone()));
    }

    private static ApiException phoneTaken() {
        return new ApiException(HttpStatus.CONFLICT, "phone_taken", "Ce numéro est déjà utilisé");
    }
}
