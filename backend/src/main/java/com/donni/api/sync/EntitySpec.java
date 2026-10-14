package com.donni.api.sync;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;

public final class EntitySpec {

    public enum FilterOp { EQ, FROM, TO, CONTAINS }

    public record Filter(String param, List<String> fields, FilterOp op) {

        public static Filter eq(String param, String field) {
            return new Filter(param, List.of(field), FilterOp.EQ);
        }

        public static Filter from(String param, String field) {
            return new Filter(param, List.of(field), FilterOp.FROM);
        }

        public static Filter to(String param, String field) {
            return new Filter(param, List.of(field), FilterOp.TO);
        }

        public static Filter contains(String param, String... fields) {
            return new Filter(param, List.of(fields), FilterOp.CONTAINS);
        }
    }

    @FunctionalInterface
    public interface CrossCheck {
        void check(Map<String, Object> data, String prefix, Map<String, String> errors);
    }

    private static final Set<String> SYSTEM_FIELDS = Set.of("id", "version", "createdAt", "updatedAt", "deletedAt");

    private final String protocolName;
    private final String restName;
    private final String table;
    private final List<Field> fields;
    private final Map<String, Field> byName = new LinkedHashMap<>();
    private final List<Filter> filters;
    private final String defaultOrder;
    private final CrossCheck crossCheck;

    private EntitySpec(String protocolName, String restName, String table, List<Field> fields, List<Filter> filters,
                       String defaultOrder, CrossCheck crossCheck) {
        this.protocolName = protocolName;
        this.restName = restName;
        this.table = table;
        this.fields = List.copyOf(fields);
        this.filters = List.copyOf(filters);
        this.defaultOrder = defaultOrder;
        this.crossCheck = crossCheck;
        fields.forEach(f -> byName.put(f.name(), f));
    }

    public static Builder named(String protocolName, String restName, String table) {
        return new Builder(protocolName, restName, table);
    }

    public String protocolName() {
        return protocolName;
    }

    public String restName() {
        return restName;
    }

    public String table() {
        return table;
    }

    public List<Field> fields() {
        return fields;
    }

    public List<Filter> filters() {
        return filters;
    }

    public String defaultOrder() {
        return defaultOrder;
    }

    public Field field(String name) {
        return byName.get(name);
    }

    /** Valide l'objet complet (pas de patch partiel) et renvoie les valeurs canoniques dans l'ordre des champs. */
    public Map<String, Object> normalize(JsonNode data, String prefix, Map<String, String> errors) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (data == null || !data.isObject()) {
            errors.put(prefix.isEmpty() ? "data" : prefix, "Objet attendu");
            return out;
        }
        data.fieldNames().forEachRemaining(name -> {
            if (!byName.containsKey(name) && !SYSTEM_FIELDS.contains(name)) {
                errors.put(path(prefix, name), "Champ inconnu");
            }
        });
        int before = errors.size();
        for (Field field : fields) {
            out.put(field.name(), field.normalize(data.get(field.name()), path(prefix, field.name()), errors));
        }
        if (crossCheck != null && errors.size() == before) {
            crossCheck.check(out, prefix, errors);
        }
        return out;
    }

    public Map<String, Object> dataToJson(Map<String, Object> canonical) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Field field : fields) {
            out.put(field.name(), field.toJson(canonical.get(field.name())));
        }
        return out;
    }

    public Map<String, Object> representation(StoredRecord record) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", record.id().toString());
        out.put("version", record.version());
        out.put("createdAt", record.createdAt().toString());
        out.put("updatedAt", record.updatedAt().toString());
        out.put("deletedAt", record.deletedAt() == null ? null : record.deletedAt().toString());
        out.putAll(dataToJson(record.data()));
        return out;
    }

    private static String path(String prefix, String name) {
        return prefix.isEmpty() ? name : prefix + "." + name;
    }

    public static final class Builder {
        private final String protocolName;
        private final String restName;
        private final String table;
        private final List<Field> fields = new ArrayList<>();
        private final List<Filter> filters = new ArrayList<>();
        private String defaultOrder = "created_at";
        private CrossCheck crossCheck;

        private Builder(String protocolName, String restName, String table) {
            this.protocolName = protocolName;
            this.restName = restName;
            this.table = table;
        }

        public Builder fields(Field... values) {
            fields.addAll(List.of(values));
            return this;
        }

        public Builder filters(Filter... values) {
            filters.addAll(List.of(values));
            return this;
        }

        public Builder orderBy(String order) {
            this.defaultOrder = order;
            return this;
        }

        public Builder crossCheck(CrossCheck check) {
            this.crossCheck = check;
            return this;
        }

        public EntitySpec build() {
            return new EntitySpec(protocolName, restName, table, fields, filters, defaultOrder, crossCheck);
        }
    }
}
