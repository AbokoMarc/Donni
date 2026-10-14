package com.donni.api.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;

class ResourceIntegrationTest extends AbstractIntegrationTest {

    private static final String GOAL = "{\"title\":\"Devenir chef projet\",\"status\":\"doing\",\"dueDate\":\"2026-06-30\"}";

    private JsonNode createGoal(Session user) throws Exception {
        MvcResult created = postJson("/api/v1/goals", user.accessToken(), GOAL);
        assertEquals(201, created.getResponse().getStatus(), body(created));
        return json(created);
    }

    @Test
    void createReadUpdateDelete() throws Exception {
        Session user = register(newPhone());

        JsonNode goal = createGoal(user);
        String id = goal.get("id").asText();
        long version = goal.get("version").asLong();
        assertTrue(version > 0);
        assertTrue(goal.get("deletedAt").isNull());
        assertEquals("2026-06-30", goal.get("dueDate").asText());

        JsonNode read = json(getJson("/api/v1/goals/" + id, user.accessToken()));
        assertEquals(version, read.get("version").asLong());

        MvcResult updated = putJson("/api/v1/goals/" + id, user.accessToken(),
                "{\"baseVersion\":%d,\"title\":\"Chef projet\",\"status\":\"done\"}".formatted(version));
        assertEquals(200, updated.getResponse().getStatus(), body(updated));
        long next = json(updated).get("version").asLong();
        assertTrue(next > version);
        assertTrue(json(updated).get("dueDate").isNull());

        MvcResult list = getJson("/api/v1/goals", user.accessToken());
        assertEquals(1, json(list).size());

        MvcResult removed = perform(withToken(delete("/api/v1/goals/" + id).param("baseVersion", String.valueOf(next)),
                user.accessToken()));
        assertEquals(204, removed.getResponse().getStatus());
        assertEquals(404, getJson("/api/v1/goals/" + id, user.accessToken()).getResponse().getStatus());
        assertEquals(0, json(getJson("/api/v1/goals", user.accessToken())).size());

        JsonNode synced = json(postJson("/api/v1/sync", user.accessToken(), "{\"cursor\":0,\"changes\":[]}"));
        assertTrue(synced.get("changes").get(0).get("deleted").asBoolean());
    }

    @Test
    void staleUpdateReturnsTheServerRecord() throws Exception {
        Session user = register(newPhone());
        JsonNode goal = createGoal(user);
        String id = goal.get("id").asText();
        long version = goal.get("version").asLong();
        putJson("/api/v1/goals/" + id, user.accessToken(),
                "{\"baseVersion\":%d,\"title\":\"Nouveau\",\"status\":\"doing\"}".formatted(version));

        MvcResult stale = putJson("/api/v1/goals/" + id, user.accessToken(),
                "{\"baseVersion\":%d,\"title\":\"Perdu\",\"status\":\"doing\"}".formatted(version));

        assertEquals(409, stale.getResponse().getStatus());
        assertEquals("version_conflict", json(stale).get("code").asText());
        assertEquals("Nouveau", json(stale).get("server").get("title").asText());
    }

    @Test
    void clientCanChooseTheIdAndRetryWithoutDuplicates() throws Exception {
        Session user = register(newPhone());
        String id = UUID.randomUUID().toString();
        String payload = "{\"id\":\"%s\",\"title\":\"Note\",\"body\":\"Texte\"}".formatted(id);

        MvcResult first = postJson("/api/v1/notes", user.accessToken(), payload);
        MvcResult retry = postJson("/api/v1/notes", user.accessToken(), payload);

        assertEquals(201, first.getResponse().getStatus());
        assertEquals(200, retry.getResponse().getStatus());
        assertEquals(id, json(retry).get("id").asText());
        assertEquals(json(first).get("version").asLong(), json(retry).get("version").asLong());

        MvcResult different = postJson("/api/v1/notes", user.accessToken(),
                "{\"id\":\"%s\",\"title\":\"Autre\",\"body\":\"Texte\"}".formatted(id));
        assertEquals(409, different.getResponse().getStatus());
    }

    @Test
    void validationErrorsListTheFields() throws Exception {
        Session user = register(newPhone());

        MvcResult result = postJson("/api/v1/tasks", user.accessToken(),
                "{\"title\":\"x\",\"kind\":\"task\",\"day\":\"2026-10-05\",\"priority\":1,\"status\":\"todo\","
                        + "\"position\":0,\"startTime\":\"9h\"}");

        assertEquals(422, result.getResponse().getStatus());
        assertTrue(json(result).get("fields").has("startTime"));
    }

    @Test
    void missingBaseVersionIsRefused() throws Exception {
        Session user = register(newPhone());
        String id = createGoal(user).get("id").asText();

        assertEquals(422, putJson("/api/v1/goals/" + id, user.accessToken(), GOAL).getResponse().getStatus());
        assertEquals(422, perform(withToken(delete("/api/v1/goals/" + id), user.accessToken())).getResponse().getStatus());
    }

    @Test
    void unknownResourceAndForeignRecordsAreNotFound() throws Exception {
        Session alice = register(newPhone());
        Session bob = register(newPhone());
        String id = createGoal(alice).get("id").asText();

        assertEquals(404, getJson("/api/v1/widgets", alice.accessToken()).getResponse().getStatus());
        assertEquals(404, getJson("/api/v1/goals/" + id, bob.accessToken()).getResponse().getStatus());
        assertEquals(404, putJson("/api/v1/goals/" + id, bob.accessToken(),
                "{\"baseVersion\":1,\"title\":\"x\",\"status\":\"todo\"}").getResponse().getStatus());
        assertEquals(0, json(getJson("/api/v1/goals", bob.accessToken())).size());
    }

    @Test
    void listsFilterAndPaginate() throws Exception {
        Session user = register(newPhone());
        String task = "{\"title\":\"%s\",\"kind\":\"task\",\"day\":\"%s\",\"priority\":1,\"status\":\"todo\",\"position\":%d}";
        postJson("/api/v1/tasks", user.accessToken(), task.formatted("A", "2026-10-05", 0));
        postJson("/api/v1/tasks", user.accessToken(), task.formatted("B", "2026-10-05", 1));
        postJson("/api/v1/tasks", user.accessToken(), task.formatted("C", "2026-10-06", 0));

        assertEquals(2, json(getJson("/api/v1/tasks?day=2026-10-05", user.accessToken())).size());
        assertEquals(1, json(getJson("/api/v1/tasks?limit=1&offset=2", user.accessToken())).size());
        assertEquals(422, getJson("/api/v1/tasks?day=hier", user.accessToken()).getResponse().getStatus());
        assertEquals(422, getJson("/api/v1/tasks?limit=0", user.accessToken()).getResponse().getStatus());

        long since = json(getJson("/api/v1/tasks", user.accessToken())).get(0).get("version").asLong();
        long highest = jdbc.queryForObject("select max(version) from tasks", Long.class);
        assertTrue(highest >= since);
        assertEquals(0, json(getJson("/api/v1/tasks?updatedSince=" + highest, user.accessToken())).size());
        assertFalse(json(getJson("/api/v1/tasks?updatedSince=0", user.accessToken())).isEmpty());
    }

    @Test
    void transactionsSupportDateCategoryAndTextFilters() throws Exception {
        Session user = register(newPhone());
        String tx = "{\"day\":\"%s\",\"label\":\"%s\",\"amountXof\":%d,\"category\":\"%s\"}";
        postJson("/api/v1/transactions", user.accessToken(), tx.formatted("2026-10-01", "Salaire", 5000, "revenus"));
        postJson("/api/v1/transactions", user.accessToken(), tx.formatted("2026-10-02", "Loyer", -2200, "logement"));
        postJson("/api/v1/transactions", user.accessToken(), tx.formatted("2026-10-04", "Épicerie 100%", -1200, "alimentation"));

        assertEquals(2, json(getJson("/api/v1/transactions?from=2026-10-02", user.accessToken())).size());
        assertEquals(2, json(getJson("/api/v1/transactions?from=2026-10-01&to=2026-10-02", user.accessToken())).size());
        assertEquals(1, json(getJson("/api/v1/transactions?category=logement", user.accessToken())).size());
        assertEquals(1, json(getJson("/api/v1/transactions?q=loy", user.accessToken())).size());
        assertEquals(1, json(perform(withToken(get("/api/v1/transactions").param("q", "100%"), user.accessToken()))).size());
        assertEquals(422, getJson("/api/v1/transactions?category=inconnue", user.accessToken()).getResponse().getStatus());
        assertEquals("Épicerie 100%", json(getJson("/api/v1/transactions?q=picerie", user.accessToken())).get(0).get("label").asText());
    }

    @Test
    void settingsAreCreatedWithDefaultsAndUpdatable() throws Exception {
        Session user = register(newPhone());

        JsonNode defaults = json(getJson("/api/v1/settings", user.accessToken()));
        assertEquals("fr", defaults.get("language").asText());
        assertFalse(defaults.get("whatsappOptIn").asBoolean());
        assertEquals(defaults.get("id").asText(), json(getJson("/api/v1/settings", user.accessToken())).get("id").asText());

        MvcResult updated = putJson("/api/v1/settings", user.accessToken(),
                "{\"baseVersion\":%d,\"focusMode\":true,\"whatsappOptIn\":true,\"language\":\"fr\",\"quietStart\":\"22:00\"}"
                        .formatted(defaults.get("version").asLong()));
        assertEquals(200, updated.getResponse().getStatus(), body(updated));
        assertTrue(json(updated).get("focusMode").asBoolean());
        assertEquals("22:00", json(updated).get("quietStart").asText());

        MvcResult stale = putJson("/api/v1/settings", user.accessToken(),
                "{\"baseVersion\":%d,\"focusMode\":false,\"whatsappOptIn\":false,\"language\":\"fr\"}"
                        .formatted(defaults.get("version").asLong()));
        assertEquals(409, stale.getResponse().getStatus());
    }

    @Test
    void dashboardSummarizesTheUsersData() throws Exception {
        Session user = register(newPhone());
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Africa/Douala")).toString();
        String wallet = UUID.randomUUID().toString();
        postJson("/api/v1/sync", user.accessToken(), """
                {"cursor":0,"changes":[
                 {"entity":"accounts","id":"%s","baseVersion":0,"data":{"label":"Mobile Money","kind":"wallet","amountXof":10900}},
                 {"entity":"accounts","id":"%s","baseVersion":0,"data":{"label":"Dette","kind":"debt","amountXof":-3200}},
                 {"entity":"accounts","id":"%s","baseVersion":0,"data":{"label":"Crédit","kind":"credit","amountXof":1000}},
                 {"entity":"transactions","id":"%s","baseVersion":0,"data":{"accountId":"%s","day":"%s","label":"Salaire","amountXof":5000,"category":"revenus"}},
                 {"entity":"transactions","id":"%s","baseVersion":0,"data":{"accountId":"%s","day":"%s","label":"Loyer","amountXof":-2200,"category":"logement"}},
                 {"entity":"transactions","id":"%s","baseVersion":0,"data":{"accountId":"%s","day":"%s","label":"Épicerie","amountXof":-1200,"category":"alimentation"}},
                 {"entity":"energy","id":"%s","baseVersion":0,"data":{"day":"%s","metric":"sleep","label":"Sommeil","value":5.5,"target":6}},
                 {"entity":"tasks","id":"%s","baseVersion":0,"data":{"title":"Rituel","kind":"routine","day":"%s","priority":1,"status":"done","position":0}},
                 {"entity":"tasks","id":"%s","baseVersion":0,"data":{"title":"Tard","kind":"task","day":"%s","startTime":"23:59","priority":1,"status":"todo","position":1}},
                 {"entity":"goals","id":"%s","baseVersion":0,"data":{"title":"G1","status":"doing","progressManual":30}}
                ]}""".formatted(wallet, UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), wallet, today, UUID.randomUUID(), wallet, today, UUID.randomUUID(), wallet, today,
                UUID.randomUUID(), today, UUID.randomUUID(), today, UUID.randomUUID(), today, UUID.randomUUID()));

        JsonNode dashboard = json(getJson("/api/v1/dashboard", user.accessToken()));

        assertEquals(12500, dashboard.get("money").get("walletBalanceXof").asLong());
        assertEquals(-3200, dashboard.get("money").get("debtXof").asLong());
        assertEquals(1000, dashboard.get("money").get("creditXof").asLong());
        assertEquals(2, dashboard.get("tasks").get("planned").asInt());
        assertEquals(1, dashboard.get("tasks").get("done").asInt());
        assertEquals("Tard", dashboard.get("tasks").get("nextTask").get("title").asText());
        assertEquals(1, dashboard.get("goals").get("active").asInt());
        assertEquals(30, dashboard.get("goals").get("averageProgress").asInt());
        assertEquals(5.5, dashboard.get("energy").get("today").get(0).get("value").asDouble());
        assertEquals(0, dashboard.get("network").get("overdueContacts").asInt());
    }
}
