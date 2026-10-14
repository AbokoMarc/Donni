package com.donni.api.sync;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Description d'un champ métier : nom du protocole, colonne SQL, type et règles de validation.
 * Les valeurs validées sont toujours converties vers une forme canonique (voir {@link #normalize}).
 */
public record Field(String name, String column, FieldType type, boolean mandatory, boolean notBlank,
                    Long min, Long max, int maxLength, List<String> values, Set<Long> allowedInts,
                    Pattern pattern) {

    private static final Pattern HHMM = Pattern.compile("^([01][0-9]|2[0-3]):[0-5][0-9]$");
    private static final Pattern UUID_FORMAT =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final BigDecimal NUMERIC_LIMIT = new BigDecimal("100000000");
    private static final int DEFAULT_MAX_LENGTH = 500;
    private static final int MAX_JSON_BYTES = 200_000;

    private static Field of(String name, FieldType type) {
        return new Field(name, snake(name), type, false, false, null, null, DEFAULT_MAX_LENGTH, List.of(), Set.of(), null);
    }

    public static Field text(String name) {
        return of(name, FieldType.TEXT);
    }

    public static Field integer(String name) {
        return of(name, FieldType.INT);
    }

    public static Field bigint(String name) {
        return of(name, FieldType.LONG);
    }

    public static Field bool(String name) {
        return of(name, FieldType.BOOL);
    }

    public static Field date(String name) {
        return of(name, FieldType.DATE);
    }

    public static Field instant(String name) {
        return of(name, FieldType.INSTANT);
    }

    public static Field time(String name) {
        return of(name, FieldType.TIME_HHMM);
    }

    public static Field numeric(String name) {
        return of(name, FieldType.NUMERIC);
    }

    public static Field json(String name) {
        return of(name, FieldType.JSON);
    }

    public static Field uuid(String name) {
        return of(name, FieldType.UUID);
    }

    public static Field choice(String name, String... values) {
        return new Field(name, snake(name), FieldType.ENUM, false, false, null, null, DEFAULT_MAX_LENGTH,
                List.of(values), Set.of(), null);
    }

    public Field required() {
        return new Field(name, column, type, true, notBlank, min, max, maxLength, values, allowedInts, pattern);
    }

    public Field nonBlank() {
        return new Field(name, column, type, mandatory, true, min, max, maxLength, values, allowedInts, pattern);
    }

    public Field range(long minimum, Long maximum) {
        return new Field(name, column, type, mandatory, notBlank, minimum, maximum, maxLength, values, allowedInts, pattern);
    }

    public Field maxLength(int length) {
        return new Field(name, column, type, mandatory, notBlank, min, max, length, values, allowedInts, pattern);
    }

    public Field oneOf(Long... allowed) {
        return new Field(name, column, type, mandatory, notBlank, min, max, maxLength, values, Set.of(allowed), pattern);
    }

    public Field matching(String regex) {
        return new Field(name, column, type, mandatory, notBlank, min, max, maxLength, values, allowedInts,
                Pattern.compile(regex));
    }

    public boolean isJson() {
        return type == FieldType.JSON;
    }

    /** Valide un champ JSON et le convertit ; renvoie null (et peut remplir {@code errors}) si absent ou invalide. */
    public Object normalize(JsonNode node, String path, Map<String, String> errors) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            if (mandatory) {
                errors.put(path, "Champ requis");
            }
            return null;
        }
        Object value = switch (type) {
            case TEXT -> text(node, path, errors);
            case ENUM -> choiceValue(node, path, errors);
            case TIME_HHMM -> time(node, path, errors);
            case INT -> number(node, path, errors, Integer.MAX_VALUE, Integer.MIN_VALUE);
            case LONG -> number(node, path, errors, Long.MAX_VALUE, Long.MIN_VALUE);
            case BOOL -> bool(node, path, errors);
            case DATE -> date(node, path, errors);
            case INSTANT -> instant(node, path, errors);
            case NUMERIC -> numeric(node, path, errors);
            case JSON -> json(node, path, errors);
            case UUID -> uuid(node, path, errors);
        };
        return value;
    }

    private Object text(JsonNode node, String path, Map<String, String> errors) {
        if (!node.isTextual()) {
            errors.put(path, "Texte attendu");
            return null;
        }
        String value = node.asText();
        if (notBlank && value.isBlank()) {
            errors.put(path, "Ne peut pas être vide");
            return null;
        }
        if (value.length() > maxLength) {
            errors.put(path, "Au plus " + maxLength + " caractères");
            return null;
        }
        if (pattern != null && !pattern.matcher(value).matches()) {
            errors.put(path, "Format invalide");
            return null;
        }
        return value;
    }

    private Object choiceValue(JsonNode node, String path, Map<String, String> errors) {
        if (!node.isTextual() || !values.contains(node.asText())) {
            errors.put(path, "Valeur attendue : " + String.join(", ", values));
            return null;
        }
        return node.asText();
    }

    private Object time(JsonNode node, String path, Map<String, String> errors) {
        if (!node.isTextual() || !HHMM.matcher(node.asText()).matches()) {
            errors.put(path, "Heure attendue au format HH:mm");
            return null;
        }
        return node.asText();
    }

    private Object number(JsonNode node, String path, Map<String, String> errors, long hardMax, long hardMin) {
        if (!node.isIntegralNumber() || !node.canConvertToLong()) {
            errors.put(path, "Entier attendu");
            return null;
        }
        long value = node.asLong();
        long lower = min == null ? hardMin : Math.max(min, hardMin);
        long upper = max == null ? hardMax : Math.min(max, hardMax);
        if (value < lower || value > upper) {
            errors.put(path, min != null && max != null ? "Valeur entre " + min + " et " + max
                    : min != null && value < min ? "Valeur minimale : " + min : "Valeur hors limites");
            return null;
        }
        if (!allowedInts.isEmpty() && !allowedInts.contains(value)) {
            errors.put(path, "Valeur attendue : " + allowedInts.stream().sorted().map(String::valueOf)
                    .reduce((a, b) -> a + ", " + b).orElse(""));
            return null;
        }
        return value;
    }

    private Object bool(JsonNode node, String path, Map<String, String> errors) {
        if (!node.isBoolean()) {
            errors.put(path, "Booléen attendu");
            return null;
        }
        return node.asBoolean();
    }

    private Object date(JsonNode node, String path, Map<String, String> errors) {
        try {
            if (node.isTextual() && node.asText().length() == 10) {
                return LocalDate.parse(node.asText());
            }
        } catch (DateTimeParseException ignored) {
            // message commun ci-dessous
        }
        errors.put(path, "Date attendue au format AAAA-MM-JJ");
        return null;
    }

    private Object instant(JsonNode node, String path, Map<String, String> errors) {
        if (node.isTextual()) {
            try {
                return OffsetDateTime.parse(node.asText()).toInstant().truncatedTo(ChronoUnit.MICROS);
            } catch (DateTimeParseException ignored) {
                // message commun ci-dessous
            }
        }
        errors.put(path, "Date et heure ISO 8601 attendues");
        return null;
    }

    private Object numeric(JsonNode node, String path, Map<String, String> errors) {
        if (!node.isNumber()) {
            errors.put(path, "Nombre attendu");
            return null;
        }
        BigDecimal value = node.decimalValue().setScale(2, java.math.RoundingMode.HALF_UP);
        if (value.abs().compareTo(NUMERIC_LIMIT) >= 0) {
            errors.put(path, "Valeur hors limites");
            return null;
        }
        return value;
    }

    private Object json(JsonNode node, String path, Map<String, String> errors) {
        if (!node.isObject()) {
            errors.put(path, "Objet attendu");
            return null;
        }
        if (node.toString().length() > MAX_JSON_BYTES) {
            errors.put(path, "Objet trop volumineux");
            return null;
        }
        return node;
    }

    private Object uuid(JsonNode node, String path, Map<String, String> errors) {
        if (node.isTextual() && UUID_FORMAT.matcher(node.asText()).matches()) {
            return java.util.UUID.fromString(node.asText().toLowerCase(Locale.ROOT));
        }
        errors.put(path, "Identifiant UUID attendu");
        return null;
    }

    /** Valeur canonique vers valeur JSON de l'API. */
    public Object toJson(Object canonical) {
        if (canonical == null) {
            return null;
        }
        return switch (type) {
            case NUMERIC -> ((BigDecimal) canonical).doubleValue();
            case DATE, UUID, INSTANT -> canonical.toString();
            default -> canonical;
        };
    }

    /** Valeur canonique vers paramètre JDBC. */
    public Object toSql(Object canonical) {
        if (canonical == null) {
            return null;
        }
        return switch (type) {
            case INSTANT -> OffsetDateTime.ofInstant((Instant) canonical, java.time.ZoneOffset.UTC);
            case JSON -> canonical.toString();
            default -> canonical;
        };
    }

    static String snake(String camel) {
        StringBuilder out = new StringBuilder();
        for (char c : camel.toCharArray()) {
            if (Character.isUpperCase(c)) {
                out.append('_').append(Character.toLowerCase(c));
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }
}
