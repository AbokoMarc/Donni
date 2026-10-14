package com.donni.api.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RefreshToken t where t.tokenHash = :hash")
    Optional<RefreshToken> findByHashForUpdate(@Param("hash") String hash);

    boolean existsByUserIdAndDeviceId(UUID userId, UUID deviceId);

    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.familyId = :family and t.revokedAt is null")
    int revokeFamily(@Param("family") UUID familyId, @Param("now") Instant now);

    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.userId = :user and t.revokedAt is null "
            + "and t.familyId <> :keep")
    int revokeAllExcept(@Param("user") UUID userId, @Param("keep") UUID keepFamily, @Param("now") Instant now);

    @Modifying
    @Query("delete from RefreshToken t where t.userId = :user and t.expiresAt < :now")
    int deleteExpired(@Param("user") UUID userId, @Param("now") Instant now);
}
