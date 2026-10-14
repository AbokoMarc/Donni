package com.donni.api.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;

class SyncIntegrationTest extends AbstractIntegrationTest {

    private static String task(String title) {
        return "{\"title\":\"%s\",\"kind\":\"task\",\"day\":\"2026-10-05\",\"priority\":1,\"status\":\"todo\",\"position\":0}"
                .formatted(title);
    }

    private static String change(String entity, String id, long base, boolean deleted, String data) {
        return "{\"entity\":\"%s\",\"id\":\"%s\",\"baseVersion\":%d,\"deleted\":%s,\"data\":%s}"
                .formatted(entity, id, base, deleted, data);
    }

    private JsonNode sync(String token, long cursor, String... changes) throws Exception {
        MvcResult result = syncRaw(token, cursor, changes);
        assertEquals(200, result.getResponse().getStatus(), body(result));
        return json(result);
    }

    private MvcResult syncRaw(String token, long cursor, String... changes) throws Exception {
        return postJson("/api/v1/sync", token,
                "{\"cursor\":%d,\"changes\":[%s]}".formatted(cursor, String.join(",", changes)));
    }

    @Test
    void createUpdateConflictAndDelete() throws Exception {
        Session user = register(newPhone());
        String id = UUID.randomUUID().toString();

        JsonNode created = sync(user.accessToken(), 0, change("tasks", id, 0, false, task("Sport")));
        long v1 = created.get("applied").get(0).get("version").asLong();
        assertTrue(v1 > 0);
        assertEquals(0, created.get("conflicts").size());
        assertEquals(0, created.get("changes").size());
        assertTrue(created.get("cursor").asLong() >= v1);

        JsonNode otherDevice = sync(user.accessToken(), 0);
        assertEquals(1, otherDevice.get("changes").size());
        JsonNode pulled = otherDevice.get("changes").get(0);
        assertEquals("tasks", pulled.get("entity").asText());
        assertEquals(v1, pulled.get("version").asLong());
        assertEquals("Sport", pulled.get("data").get("title").asText());
        assertFalse(pulled.get("deleted").asBoolean());

        JsonNode updated = sync(user.accessToken(), v1, change("tasks", id, v1, false, task("Sport du soir")));
        long v2 = updated.get("applied").get(0).get("version").asLong();
        assertTrue(v2 > v1);

        JsonNode conflict = sync(user.accessToken(), v2, change("tasks", id, v1, false, task("Autre titre")));
        assertEquals(0, conflict.get("applied").size());
        assertEquals(1, conflict.get("conflicts").size());
        JsonNode server = conflict.get("conflicts").get(0).get("server");
        assertEquals(v2, server.get("version").asLong());
        assertEquals("Sport du soir", server.get("data").get("title").asText());

        JsonNode deleted = sync(user.accessToken(), v2, change("tasks", id, v2, true, "{}"));
        long v3 = deleted.get("applied").get(0).get("version").asLong();
        assertTrue(v3 > v2);

        JsonNode tombstones = sync(user.accessToken(), v2);
        assertEquals(1, tombstones.get("changes").size());
        assertTrue(tombstones.get("changes").get(0).get("deleted").asBoolean());
        assertEquals(v3, tombstones.get("changes").get(0).get("version").asLong());
    }

    @Test
    void retryAfterALostResponseIsIdempotent() throws Exception {
        Session user = register(newPhone());
        String id = UUID.randomUUID().toString();
        String create = change("tasks", id, 0, false, task("Sport"));

        long first = sync(user.accessToken(), 0, create).get("applied").get(0).get("version").asLong();
        JsonNode retry = sync(user.accessToken(), 0, create);

        assertEquals(first, retry.get("applied").get(0).get("version").asLong());
        assertEquals(0, retry.get("conflicts").size());
        assertEquals(1, jdbc.queryForObject("select count(*) from tasks where id = ?::uuid", Integer.class, id));
        assertEquals(first, jdbc.queryForObject("select version from tasks where id = ?::uuid", Long.class, id));
    }

    @Test
    void usersNeverSeeOrTouchEachOther() throws Exception {
        Session alice = register(newPhone());
        Session bob = register(newPhone());
        String id = UUID.randomUUID().toString();
        long version = sync(alice.accessToken(), 0, change("tasks", id, 0, false, task("Privé")))
                .get("applied").get(0).get("version").asLong();

        assertEquals(0, sync(bob.accessToken(), 0).get("changes").size());

        MvcResult forged = syncRaw(bob.accessToken(), 0, change("tasks", id, version, false, task("Piraté")));
        assertEquals(403, forged.getResponse().getStatus());
        assertEquals("forbidden", json(forged).get("code").asText());
        assertFalse(body(forged).contains("Privé"));

        MvcResult forgedDelete = syncRaw(bob.accessToken(), 0, change("tasks", id, version, true, "{}"));
        assertEquals(403, forgedDelete.getResponse().getStatus());

        assertEquals("Privé", jdbc.queryForObject("select title from tasks where id = ?::uuid", String.class, id));
        assertEquals(1, sync(alice.accessToken(), 0).get("changes").size());
        assertEquals(404, getJson("/api/v1/tasks/" + id, bob.accessToken()).getResponse().getStatus());
    }

    @Test
    void invalidRequestWritesNothing() throws Exception {
        Session user = register(newPhone());
        String valid = UUID.randomUUID().toString();
        String invalid = UUID.randomUUID().toString();

        MvcResult result = syncRaw(user.accessToken(), 0,
                change("tasks", valid, 0, false, task("Valide")),
                change("tasks", invalid, 0, false, task("Invalide").replace("\"todo\"", "\"fini\"")));

        assertEquals(422, result.getResponse().getStatus());
        assertEquals("validation_failed", json(result).get("code").asText());
        assertTrue(json(result).get("fields").has("changes[1].data.status"));
        assertEquals(0, sync(user.accessToken(), 0).get("changes").size());
    }

    @Test
    void unknownEntityIsRefused() throws Exception {
        Session user = register(newPhone());

        MvcResult result = syncRaw(user.accessToken(), 0,
                change("widgets", UUID.randomUUID().toString(), 0, false, "{}"));

        assertEquals(422, result.getResponse().getStatus());
    }

    @Test
    void childCanBePushedBeforeItsParent() throws Exception {
        Session user = register(newPhone());
        String goal = UUID.randomUUID().toString();
        String step = UUID.randomUUID().toString();

        JsonNode response = sync(user.accessToken(), 0,
                change("goalSteps", step, 0, false,
                        "{\"goalId\":\"%s\",\"title\":\"Étape\",\"done\":false,\"position\":0}".formatted(goal)),
                change("goals", goal, 0, false, "{\"title\":\"Objectif\",\"status\":\"doing\"}"));

        assertEquals(2, response.get("applied").size());
    }

    @Test
    void pagesChangesByTwoHundredWithHasMore() throws Exception {
        Session user = register(newPhone());
        for (int batch = 0; batch < 2; batch++) {
            String[] changes = new String[batch == 0 ? 200 : 50];
            for (int i = 0; i < changes.length; i++) {
                changes[i] = change("notes", UUID.randomUUID().toString(), 0, false, "{\"title\":\"n\",\"body\":\"b\"}");
            }
            assertEquals(changes.length, sync(user.accessToken(), 0, changes).get("applied").size());
        }

        JsonNode firstPage = sync(user.accessToken(), 0);
        assertEquals(200, firstPage.get("changes").size());
        assertTrue(firstPage.get("hasMore").asBoolean());

        JsonNode secondPage = sync(user.accessToken(), firstPage.get("cursor").asLong());
        assertEquals(50, secondPage.get("changes").size());
        assertFalse(secondPage.get("hasMore").asBoolean());

        JsonNode done = sync(user.accessToken(), secondPage.get("cursor").asLong());
        assertEquals(0, done.get("changes").size());
        assertEquals(secondPage.get("cursor").asLong(), done.get("cursor").asLong());
    }

    @Test
    void versionsFollowCommitOrder() throws Exception {
        Session user = register(newPhone());
        long previous = 0;
        for (int i = 0; i < 5; i++) {
            long version = sync(user.accessToken(), previous,
                    change("notes", UUID.randomUUID().toString(), 0, false, "{\"title\":\"n\",\"body\":\"b\"}"))
                    .get("applied").get(0).get("version").asLong();
            assertTrue(version > previous);
            previous = version;
        }
    }

    @Test
    void editingATombstoneWithAStaleVersionConflicts() throws Exception {
        Session user = register(newPhone());
        String id = UUID.randomUUID().toString();
        long v1 = sync(user.accessToken(), 0, change("tasks", id, 0, false, task("A"))).get("applied").get(0).get("version").asLong();
        sync(user.accessToken(), v1, change("tasks", id, v1, true, "{}"));

        JsonNode response = sync(user.accessToken(), v1, change("tasks", id, v1, false, task("B")));

        assertEquals(1, response.get("conflicts").size());
        assertTrue(response.get("conflicts").get(0).get("server").get("deleted").asBoolean());
    }
}
