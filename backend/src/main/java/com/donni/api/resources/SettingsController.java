package com.donni.api.resources;

import java.util.Map;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.donni.api.security.AccessTokenService;
import com.fasterxml.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v1/settings")
public class SettingsController {

    private final ResourceService service;

    public SettingsController(ResourceService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> get(@AuthenticationPrincipal Jwt jwt) {
        return service.settings(AccessTokenService.userId(jwt));
    }

    @PutMapping
    public Map<String, Object> update(@AuthenticationPrincipal Jwt jwt, @RequestBody JsonNode body) {
        return service.updateSettings(AccessTokenService.userId(jwt), body);
    }
}
