package com.donni.api.devices;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface DeviceRepository extends JpaRepository<Device, UUID> {

    Optional<Device> findByFcmToken(String fcmToken);

    List<Device> findByUserId(UUID userId);

    @Transactional
    long deleteByUserIdAndFcmToken(UUID userId, String fcmToken);

    @Transactional
    long deleteByFcmToken(String fcmToken);
}
