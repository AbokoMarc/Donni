package com.donni.api.sync;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import com.donni.api.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;

public final class SyncRequestParser {

    public static final int MAX_CHANGES = 200;
    private static final Pattern UUID_FORMAT =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    public record ParsedChange(EntitySpec spec, UUID id, long baseVersion, boolean deleted, Map<String, Object> data) {
    }

    public record ParsedRequest(long cursor, List<ParsedChange> changes) {
    }

    private SyncRequestParser() {
    }

    /** Valide toute la requête avant la moindre écriture : une seule erreur refuse l'ensemble. */
    public static ParsedRequest parse(JsonNode body, EntitySpecs specs) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (body == null || !body.isObject()) {
            throw ApiException.validation("body", "Objet JSON attendu");
        }
        long cursor = nonNegative(body.get("cursor"), "cursor", errors);
        JsonNode device = body.get("deviceId");
        if (device != null && !device.isNull() && !(device.isTextual() && UUID_FORMAT.matcher(device.asText()).matches())) {
            errors.put("deviceId", "Identifiant UUID attendu");
        }
        List<ParsedChange> changes = new ArrayList<>();
        JsonNode array = body.get("changes");
        if (array != null && !array.isNull()) {
            if (!array.isArray()) {
                errors.put("changes", "Liste attendue");
            } else if (array.size() > MAX_CHANGES) {
                errors.put("changes", MAX_CHANGES + " modifications au plus par requête");
            } else {
                for (int i = 0; i < array.size(); i++) {
                    parseChange(array.get(i), "changes[" + i + "]", specs, errors, changes);
                }
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        return new ParsedRequest(cursor, changes);
    }

    private static void parseChange(JsonNode node, String path, EntitySpecs specs, Map<String, String> errors,
                                    List<ParsedChange> out) {
        if (node == null || !node.isObject()) {
            errors.put(path, "Objet attendu");
            return;
        }
        int before = errors.size();
        EntitySpec spec = null;
        JsonNode entity = node.get("entity");
        if (entity == null || !entity.isTextual()) {
            errors.put(path + ".entity", "Champ requis");
        } else {
            spec = specs.protocol(entity.asText()).orElse(null);
            if (spec == null) {
                errors.put(path + ".entity", "Entité inconnue");
            }
        }
        UUID id = null;
        JsonNode idNode = node.get("id");
        if (idNode == null || !idNode.isTextual() || !UUID_FORMAT.matcher(idNode.asText()).matches()) {
            errors.put(path + ".id", "Identifiant UUID attendu");
        } else {
            id = UUID.fromString(idNode.asText());
        }
        long base = nonNegative(node.get("baseVersion"), path + ".baseVersion", errors);
        if (node.get("baseVersion") == null) {
            errors.put(path + ".baseVersion", "Champ requis");
        }
        boolean deleted = false;
        JsonNode deletedNode = node.get("deleted");
        if (deletedNode != null && !deletedNode.isNull()) {
            if (deletedNode.isBoolean()) {
                deleted = deletedNode.asBoolean();
            } else {
                errors.put(path + ".deleted", "Booléen attendu");
            }
        }
        Map<String, Object> data = Map.of();
        if (spec != null && !deleted) {
            data = spec.normalize(node.get("data"), path + ".data", errors);
        }
        if (errors.size() == before) {
            out.add(new ParsedChange(spec, id, base, deleted, data));
        }
    }

    private static long nonNegative(JsonNode node, String path, Map<String, String> errors) {
        if (node == null || node.isNull()) {
            return 0L;
        }
        if (!node.isIntegralNumber() || !node.canConvertToLong() || node.asLong() < 0) {
            errors.put(path, "Entier positif ou nul attendu");
            return 0L;
        }
        return node.asLong();
    }
}
