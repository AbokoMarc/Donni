package com.donni.api.sync;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

class EntitySpecsTest {

    private final EntitySpecs specs = new EntitySpecs();
    private final ObjectMapper mapper = new ObjectMapper();

    private Map<String, String> validate(String entity, String json) throws Exception {
        Map<String, String> errors = new LinkedHashMap<>();
        specs.require(entity).normalize(mapper.readTree(json), "", errors);
        return errors;
    }

    @Test
    void registryCoversTheSixteenEntitiesWithUniqueNames() {
        assertEquals(16, specs.all().size());
        Set<String> tables = specs.all().stream().map(EntitySpec::table).collect(Collectors.toSet());
        assertEquals(16, tables.size());
        assertTrue(tables.contains("energy_logs"));
        assertTrue(tables.contains("user_settings"));
        assertEquals("goal-steps", specs.require("goalSteps").restName());
        assertTrue(specs.rest("contact-interactions").isPresent());
        assertTrue(specs.protocol("goal-steps").isEmpty());
    }

    @Test
    void columnsAreSnakeCaseOfFieldNames() {
        assertEquals("start_time", specs.require("tasks").field("startTime").column());
        assertEquals("whatsapp_sent_at", specs.require("reminders").field("whatsappSentAt").column());
    }

    @Test
    void acceptsAValidTaskAndConvertsValues() throws Exception {
        Map<String, String> errors = new LinkedHashMap<>();
        JsonNode json = mapper.readTree("""
                {"title":"Sport","kind":"task","day":"2026-10-05","startTime":"09:00","priority":1,
                 "status":"todo","position":0}""");
        Map<String, Object> data = specs.require("tasks").normalize(json, "", errors);
        assertTrue(errors.isEmpty(), errors.toString());
        assertEquals(LocalDate.of(2026, 10, 5), data.get("day"));
        assertEquals(1L, data.get("priority"));
        assertNull(data.get("notes"));
    }

    @Test
    void rejectsMissingRequiredFieldsAndUnknownEnumValues() throws Exception {
        Map<String, String> errors = validate("tasks", "{\"title\":\"x\",\"kind\":\"meeting\"}");
        assertTrue(errors.containsKey("kind"));
        assertTrue(errors.containsKey("day"));
        assertTrue(errors.containsKey("status"));
    }

    @Test
    void rejectsUnknownFields() throws Exception {
        Map<String, String> errors = validate("goals", "{\"title\":\"x\",\"status\":\"todo\",\"colour\":\"red\"}");
        assertEquals("Champ inconnu", errors.get("colour"));
    }

    @Test
    void ignoresSystemFieldsInData() throws Exception {
        assertTrue(validate("goals", "{\"id\":\"x\",\"version\":3,\"title\":\"x\",\"status\":\"todo\"}").isEmpty());
    }

    @Test
    void validatesTimeFormat() throws Exception {
        String base = "{\"title\":\"x\",\"kind\":\"task\",\"day\":\"2026-10-05\",\"priority\":1,\"status\":\"todo\","
                + "\"position\":0,\"startTime\":\"%s\"}";
        assertTrue(validate("tasks", base.formatted("09:00")).isEmpty());
        assertTrue(validate("tasks", base.formatted("23:59")).isEmpty());
        for (String bad : new String[] {"9:00", "24:00", "09:60", "09h00", "09:00:00", ""}) {
            assertTrue(validate("tasks", base.formatted(bad)).containsKey("startTime"), bad);
        }
    }

    @Test
    void validatesDatesNumbersAndRanges() throws Exception {
        assertTrue(validate("goals", "{\"title\":\"x\",\"status\":\"todo\",\"dueDate\":\"2026-02-30\"}").containsKey("dueDate"));
        assertTrue(validate("goals", "{\"title\":\"x\",\"status\":\"todo\",\"progressManual\":101}").containsKey("progressManual"));
        assertTrue(validate("goals", "{\"title\":\"x\",\"status\":\"todo\",\"progressManual\":\"50\"}").containsKey("progressManual"));
        assertTrue(validate("goals", "{\"title\":\"x\",\"status\":\"todo\",\"progressManual\":50.5}").containsKey("progressManual"));
        assertTrue(validate("skills", "{\"name\":\"x\",\"level\":-1}").containsKey("level"));
        assertTrue(validate("skills", "{\"name\":\"x\",\"level\":100}").isEmpty());
    }

    @Test
    void budgetRules() throws Exception {
        String ok = "{\"month\":\"2026-10\",\"limitXof\":5000,\"alertedLevel\":80}";
        assertTrue(validate("budgets", ok).isEmpty());
        assertTrue(validate("budgets", ok.replace("5000", "0")).containsKey("limitXof"));
        assertTrue(validate("budgets", ok.replace("80", "50")).containsKey("alertedLevel"));
        assertTrue(validate("budgets", ok.replace("2026-10", "2026-13")).containsKey("month"));
    }

    @Test
    void blankRequiredTextIsRejected() throws Exception {
        assertTrue(validate("goals", "{\"title\":\"  \",\"status\":\"todo\"}").containsKey("title"));
    }

    @Test
    void contactFrequencyDayDependsOnKind() throws Exception {
        String base = "{\"name\":\"Maman\",\"relation\":\"famille\",\"frequencyKind\":\"%s\",\"frequencyDay\":%d}";
        assertTrue(validate("contacts", base.formatted("weekly", 6)).isEmpty());
        assertTrue(validate("contacts", base.formatted("weekly", 7)).containsKey("frequencyDay"));
        assertTrue(validate("contacts", base.formatted("monthly", 28)).isEmpty());
        assertTrue(validate("contacts", base.formatted("monthly", 0)).containsKey("frequencyDay"));
    }

    @Test
    void instantsAreNormalizedToUtcMicroseconds() throws Exception {
        Map<String, String> errors = new LinkedHashMap<>();
        JsonNode json = mapper.readTree("""
                {"targetType":"custom","label":"x","fireAt":"2026-10-05T18:00:00.123456789+01:00",
                 "status":"scheduled","viaWhatsapp":false}""");
        Map<String, Object> data = specs.require("reminders").normalize(json, "", errors);
        assertTrue(errors.isEmpty(), errors.toString());
        assertEquals(Instant.parse("2026-10-05T17:00:00.123456Z"), data.get("fireAt"));
        assertFalse(validate("reminders", "{\"targetType\":\"custom\",\"label\":\"x\",\"fireAt\":\"hier\","
                + "\"status\":\"scheduled\",\"viaWhatsapp\":false}").isEmpty());
    }

    @Test
    void energyValuesKeepTwoDecimals() throws Exception {
        Map<String, String> errors = new LinkedHashMap<>();
        Map<String, Object> data = specs.require("energy").normalize(mapper.readTree(
                "{\"day\":\"2026-10-05\",\"metric\":\"sleep\",\"label\":\"Sommeil\",\"value\":5.5,\"target\":6}"), "", errors);
        assertTrue(errors.isEmpty());
        assertEquals(new BigDecimal("5.50"), data.get("value"));
        assertEquals(5.5d, specs.require("energy").field("value").toJson(data.get("value")));
    }

    @Test
    void weeklyReviewPayloadMustBeAnObject() throws Exception {
        assertTrue(validate("weeklyReviews", "{\"weekStart\":\"2026-10-05\",\"payload\":{\"a\":1}}").isEmpty());
        assertTrue(validate("weeklyReviews", "{\"weekStart\":\"2026-10-05\",\"payload\":[1]}").containsKey("payload"));
    }

    @Test
    void referencesMustBeCanonicalUuids() throws Exception {
        String ok = "{\"goalId\":\"6f1c2b1a-1d2e-4f3a-9b4c-5d6e7f8a9b0c\",\"title\":\"x\",\"done\":false,\"position\":0}";
        assertTrue(validate("goalSteps", ok).isEmpty());
        assertTrue(validate("goalSteps", ok.replace("6f1c2b1a-1d2e-4f3a-9b4c-5d6e7f8a9b0c", "1-1-1-1-1")).containsKey("goalId"));
    }

    @Test
    void sameInputGivesEqualCanonicalData() throws Exception {
        String json = "{\"focusMode\":true,\"whatsappOptIn\":false,\"language\":\"fr\"}";
        EntitySpec spec = specs.require("settings");
        Map<String, String> errors = new LinkedHashMap<>();
        assertEquals(spec.normalize(mapper.readTree(json), "", errors), spec.normalize(mapper.readTree(json), "", errors));
    }
}
