package com.donni.api.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.donni.api.common.ApiException;
import com.donni.api.config.DonniProperties;

class RefreshTokenServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-05T10:00:00Z");

    private final RefreshTokenRepository repository = mock(RefreshTokenRepository.class);
    private final DonniProperties properties = new DonniProperties("Africa/Douala", "",
            new DonniProperties.Jwt("secret", "pepper", Duration.ofMinutes(15), Duration.ofDays(30)),
            new DonniProperties.Cors(List.of()), new DonniProperties.Fcm("", "", ""),
            new DonniProperties.Whatsapp("disabled", "", "", "", "", "", "v21.0"));
    private final TokenHasher hasher = new TokenHasher(properties);
    private final UUID userId = UUID.randomUUID();

    private RefreshTokenService service(Instant at) {
        return new RefreshTokenService(repository, hasher, properties, Clock.fixed(at, ZoneOffset.UTC));
    }

    private RefreshTokenService.Issued issueAndRegister(RefreshTokenService service) {
        when(repository.save(any(RefreshToken.class))).thenAnswer(call -> call.getArgument(0));
        RefreshTokenService.Issued issued = service.issue(userId, null, UUID.randomUUID());
        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).save(saved.capture());
        when(repository.findByHashForUpdate(hasher.hash(issued.token()))).thenReturn(Optional.of(saved.getValue()));
        return issued;
    }

    @Test
    void rotationKeepsTheFamilyAndGivesANewToken() {
        RefreshTokenService service = service(NOW);
        RefreshTokenService.Issued first = issueAndRegister(service);

        RefreshTokenService.Issued second = service.rotate(first.token());

        assertEquals(first.familyId(), second.familyId());
        assertNotEquals(first.token(), second.token());
        verify(repository, never()).revokeFamily(any(), any());
    }

    @Test
    void reusingAConsumedTokenRevokesTheWholeFamily() {
        RefreshTokenService service = service(NOW);
        RefreshTokenService.Issued first = issueAndRegister(service);
        service.rotate(first.token());

        ApiException error = assertThrows(ApiException.class, () -> service.rotate(first.token()));

        assertEquals("refresh_reused", error.code());
        assertEquals(401, error.status().value());
        verify(repository).revokeFamily(eq(first.familyId()), any());
    }

    @Test
    void unknownTokenIsRefused() {
        when(repository.findByHashForUpdate(any())).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class, () -> service(NOW).rotate("inconnu"));

        assertEquals("unauthorized", error.code());
    }

    @Test
    void expiredTokenIsRefusedWithoutRevocation() {
        RefreshTokenService.Issued first = issueAndRegister(service(NOW));

        ApiException error = assertThrows(ApiException.class,
                () -> service(NOW.plus(Duration.ofDays(31))).rotate(first.token()));

        assertEquals("token_expired", error.code());
        verify(repository, never()).revokeFamily(any(), any());
    }

    @Test
    void hashDependsOnThePepper() {
        DonniProperties other = new DonniProperties("Africa/Douala", "",
                new DonniProperties.Jwt("secret", "autre", Duration.ofMinutes(15), Duration.ofDays(30)),
                new DonniProperties.Cors(List.of()), new DonniProperties.Fcm("", "", ""),
                new DonniProperties.Whatsapp("disabled", "", "", "", "", "", "v21.0"));
        assertNotEquals(hasher.hash("abc"), new TokenHasher(other).hash("abc"));
        assertEquals(hasher.hash("abc"), hasher.hash("abc"));
    }
}
