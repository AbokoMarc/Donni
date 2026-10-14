package com.donni.api.resources;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.donni.api.common.ApiException;
import com.donni.api.security.AccessTokenService;
import com.fasterxml.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v1/{resource}")
public class ResourceController {

    private final ResourceService service;

    public ResourceController(ResourceService service) {
        this.service = service;
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @PathVariable String resource,
                                          @RequestParam Map<String, String> query) {
        return service.list(service.spec(resource), AccessTokenService.userId(jwt), query);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@AuthenticationPrincipal Jwt jwt, @PathVariable String resource,
                                   @PathVariable String id) {
        return service.get(service.spec(resource), AccessTokenService.userId(jwt), parseId(id));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@AuthenticationPrincipal Jwt jwt, @PathVariable String resource,
                                                      @RequestBody JsonNode body) {
        ResourceService.Saved saved = service.create(service.spec(resource), AccessTokenService.userId(jwt), body);
        return ResponseEntity.status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.record());
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@AuthenticationPrincipal Jwt jwt, @PathVariable String resource,
                                      @PathVariable String id, @RequestBody JsonNode body) {
        return service.update(service.spec(resource), AccessTokenService.userId(jwt), parseId(id), body);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String resource, @PathVariable String id,
                       @RequestParam(required = false) String baseVersion) {
        service.delete(service.spec(resource), AccessTokenService.userId(jwt), parseId(id), baseVersion);
    }

    private static UUID parseId(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound();
        }
    }
}
