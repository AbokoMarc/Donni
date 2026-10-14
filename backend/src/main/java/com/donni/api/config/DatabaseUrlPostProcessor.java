package com.donni.api.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Les hébergeurs fournissent souvent une URL postgres://user:pass@hôte:port/base ; le pilote JDBC attend
 * une URL jdbc:postgresql:// sans identifiants intégrés.
 */
public class DatabaseUrlPostProcessor implements EnvironmentPostProcessor {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String url = environment.getProperty("DATABASE_URL");
        if (url == null || !(url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
            return;
        }
        URI uri = URI.create(url);
        Map<String, Object> converted = new HashMap<>();
        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String query = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
        converted.put("spring.datasource.url", "jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getRawPath() + query);
        if (uri.getRawUserInfo() != null && environment.getProperty("DATABASE_USER") == null) {
            String[] parts = uri.getRawUserInfo().split(":", 2);
            converted.put("spring.datasource.username", decode(parts[0]));
            if (parts.length > 1 && environment.getProperty("DATABASE_PASSWORD") == null) {
                converted.put("spring.datasource.password", decode(parts[1]));
            }
        }
        environment.getPropertySources().addFirst(new MapPropertySource("databaseUrl", converted));
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
