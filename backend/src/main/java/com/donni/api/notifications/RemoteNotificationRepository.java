package com.donni.api.notifications;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RemoteNotificationRepository extends JpaRepository<RemoteNotification, UUID> {

    @Query("select n from RemoteNotification n where n.userId = :user and n.createdAt < :before order by n.createdAt desc")
    List<RemoteNotification> page(@Param("user") UUID userId, @Param("before") Instant before, Pageable pageable);

    Optional<RemoteNotification> findByIdAndUserId(UUID id, UUID userId);
}
