package com.donni.api.auth;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.donni.api.common.ApiException;
import com.donni.api.config.DonniProperties;

@Service
public class RefreshTokenService {

    public record Issued(String token, UUID userId, UUID familyId) {
    }

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository repository;
    private final TokenHasher hasher;
    private final DonniProperties properties;
    private final Clock clock;

    public RefreshTokenService(RefreshTokenRepository repository, TokenHasher hasher, DonniProperties properties,
                               Clock clock) {
        this.repository = repository;
        this.hasher = hasher;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public Issued issue(UUID userId, UUID familyId, UUID deviceId) {
        Instant now = clock.instant();
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        UUID family = familyId == null ? UUID.randomUUID() : familyId;
        repository.save(new RefreshToken(userId, family, hasher.hash(token), deviceId, now,
                now.plus(properties.jwt().refreshTtl())));
        return new Issued(token, userId, family);
    }

    /** La révocation de la famille doit survivre à l'exception levée en cas de réutilisation. */
    @Transactional(noRollbackFor = ApiException.class)
    public Issued rotate(String rawToken) {
        Instant now = clock.instant();
        RefreshToken current = repository.findByHashForUpdate(hasher.hash(rawToken))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Session invalide"));
        switch (current.stateAt(now)) {
            case REUSED -> {
                repository.revokeFamily(current.getFamilyId(), now);
                throw new ApiException(HttpStatus.UNAUTHORIZED, "refresh_reused",
                        "Session révoquée par sécurité, reconnectez-vous");
            }
            case EXPIRED -> throw new ApiException(HttpStatus.UNAUTHORIZED, "token_expired", "Session expirée");
            default -> current.markUsed(now);
        }
        return issue(current.getUserId(), current.getFamilyId(), current.getDeviceId());
    }

    @Transactional
    public void revoke(String rawToken) {
        repository.findByHashForUpdate(hasher.hash(rawToken))
                .ifPresent(token -> repository.revokeFamily(token.getFamilyId(), clock.instant()));
    }

    @Transactional
    public void revokeAllExcept(UUID userId, UUID keepFamily) {
        repository.revokeAllExcept(userId, keepFamily == null ? new UUID(0, 0) : keepFamily, clock.instant());
    }

    @Transactional
    public void purgeExpired(UUID userId) {
        repository.deleteExpired(userId, clock.instant());
    }

    public boolean knowsDevice(UUID userId, UUID deviceId) {
        return repository.existsByUserIdAndDeviceId(userId, deviceId);
    }
}
