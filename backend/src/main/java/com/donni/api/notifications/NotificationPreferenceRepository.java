package com.donni.api.notifications;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, NotificationPreference.Key> {

    @Query("select p from NotificationPreference p where p.id.userId = :user")
    List<NotificationPreference> findByUser(@Param("user") UUID userId);
}
