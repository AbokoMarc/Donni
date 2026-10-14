package com.donni.api.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
abstract class AbstractIntegrationTest {

    record Session(String accessToken, String refreshToken, String userId, String phone) {
    }

    static final String PASSWORD = "motdepasse-solide";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    private static final AtomicInteger PHONE_COUNTER = new AtomicInteger(10_000_000);

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper mapper;

    @Autowired
    protected JdbcTemplate jdbc;

    protected static String newPhone() {
        return "+2376" + PHONE_COUNTER.incrementAndGet();
    }

    protected MvcResult perform(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request).andReturn();
    }

    protected static String body(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    protected JsonNode json(MvcResult result) throws Exception {
        return mapper.readTree(body(result));
    }

    protected MvcResult postJson(String url, String token, String content) throws Exception {
        return perform(withToken(post(url), token).contentType(MediaType.APPLICATION_JSON).content(content));
    }

    protected MvcResult putJson(String url, String token, String content) throws Exception {
        return perform(withToken(put(url), token).contentType(MediaType.APPLICATION_JSON).content(content));
    }

    protected MvcResult getJson(String url, String token) throws Exception {
        return perform(withToken(get(url), token));
    }

    protected MvcResult deleteJson(String url, String token) throws Exception {
        return perform(withToken(delete(url), token));
    }

    protected static MockHttpServletRequestBuilder withToken(MockHttpServletRequestBuilder request, String token) {
        return token == null ? request : request.header("Authorization", "Bearer " + token);
    }

    protected Session register(String phone) throws Exception {
        MvcResult result = postJson("/api/v1/auth/register", null,
                "{\"fullName\":\"Marc\",\"phone\":\"%s\",\"password\":\"%s\"}".formatted(phone, PASSWORD));
        if (result.getResponse().getStatus() != 201) {
            throw new AssertionError("Inscription refusée : " + body(result));
        }
        return session(json(result), phone);
    }

    protected Session login(String phone, String password, String deviceId) throws Exception {
        String device = deviceId == null ? "" : ",\"deviceId\":\"" + deviceId + "\"";
        MvcResult result = postJson("/api/v1/auth/login", null,
                "{\"phone\":\"%s\",\"password\":\"%s\"%s}".formatted(phone, password, device));
        if (result.getResponse().getStatus() != 200) {
            throw new AssertionError("Connexion refusée : " + body(result));
        }
        return session(json(result), phone);
    }

    protected static Session session(JsonNode auth, String phone) {
        return new Session(auth.get("accessToken").asText(), auth.get("refreshToken").asText(),
                auth.get("user").get("id").asText(), phone);
    }
}
