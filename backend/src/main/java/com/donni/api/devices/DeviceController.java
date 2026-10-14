package com.donni.api.devices;

import java.time.Clock;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.donni.api.security.AccessTokenService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/v1/devices")
public class DeviceController {

    public record DeviceRequest(
            @NotBlank(message = "Jeton requis") @Size(max = 4096, message = "Jeton trop long") String fcmToken,
            @Size(max = 40, message = "Au plus 40 caractères") String appVersion) {
    }

    private final DeviceRepository devices;
    private final Clock clock;

    public DeviceController(DeviceRepository devices, Clock clock) {
        this.devices = devices;
        this.clock = clock;
    }

    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void register(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DeviceRequest request) {
        var userId = AccessTokenService.userId(jwt);
        var now = clock.instant();
        Device device = devices.findByFcmToken(request.fcmToken())
                .orElseGet(() -> new Device(userId, request.fcmToken(), request.appVersion(), now));
        device.claim(userId, request.appVersion(), now);
        devices.save(device);
    }

    @DeleteMapping("/{fcmToken}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable String fcmToken) {
        devices.deleteByUserIdAndFcmToken(AccessTokenService.userId(jwt), fcmToken);
    }
}
