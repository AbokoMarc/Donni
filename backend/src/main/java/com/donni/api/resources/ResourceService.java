package com.donni.api.resources;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.donni.api.auth.UserRepository;
import com.donni.api.common.ApiException;
import com.donni.api.sync.ChangeApplier;
import com.donni.api.sync.EntitySpec;
import com.donni.api.sync.EntitySpecs;
import com.donni.api.sync.Field;
import com.donni.api.sync.SyncNotifier;
import com.donni.api.sync.SyncRecordRepository;
import com.donni.api.sync.SyncRules;
import com.donni.api.sync.StoredRecord;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;

@Service
public class ResourceService {

    static final int DEFAULT_LIMIT = 100;
    static final int MAX_LIMIT = 500;

    public record Saved(Map<String, Object> record, boolean created) {
    }

    private record Tx<T>(T value, boolean written) {
    }

    private final EntitySpecs specs;
    private final SyncRecordRepository repository;
    private final ChangeApplier applier;
    private final UserRepository users;
    private final TransactionTemplate transaction;
    private final SyncNotifier notifier;
    private final Clock clock;

    public ResourceService(EntitySpecs specs, SyncRecordRepository repository, ChangeApplier applier,
                           UserRepository users, TransactionTemplate transaction, SyncNotifier notifier, Clock clock) {
        this.specs = specs;
        this.repository = repository;
        this.applier = applier;
        this.users = users;
        this.transaction = transaction;
        this.notifier = notifier;
        this.clock = clock;
    }

    public EntitySpec spec(String restName) {
        return specs.rest(restName).orElseThrow(ApiException::notFound);
    }

    public List<Map<String, Object>> list(EntitySpec spec, UUID userId, Map<String, String> query) {
        Map<String, String> errors = new LinkedHashMap<>();
        Long since = null;
        if (query.get("updatedSince") != null) {
            since = parseLong(query.get("updatedSince"), "updatedSince", 0, Long.MAX_VALUE, errors);
        }
        int limit = DEFAULT_LIMIT;
        if (query.get("limit") != null) {
            limit = (int) parseLong(query.get("limit"), "limit", 1, MAX_LIMIT, errors);
        }
        int offset = 0;
        if (query.get("offset") != null) {
            offset = (int) parseLong(query.get("offset"), "offset", 0, Integer.MAX_VALUE, errors);
        }
        Map<String, Object> filters = new LinkedHashMap<>();
        for (EntitySpec.Filter filter : spec.filters()) {
            String raw = query.get(filter.param());
            if (raw == null || raw.isBlank()) {
                continue;
            }
            if (filter.op() == EntitySpec.FilterOp.CONTAINS) {
                if (raw.length() > 100) {
                    errors.put(filter.param(), "Au plus 100 caractères");
                } else {
                    filters.put(filter.param(), raw);
                }
                continue;
            }
            Field field = spec.field(filter.fields().get(0));
            Object value = field.normalize(TextNode.valueOf(raw), filter.param(), errors);
            if (value != null) {
                filters.put(filter.param(), value);
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        return repository.list(spec, userId, new SyncRecordRepository.ListQuery(since, filters, limit, offset)).stream()
                .map(spec::representation).toList();
    }

    public Map<String, Object> get(EntitySpec spec, UUID userId, UUID id) {
        return spec.representation(visible(spec, userId, id));
    }

    public Saved create(EntitySpec spec, UUID userId, JsonNode body) {
        Map<String, String> errors = new LinkedHashMap<>();
        UUID id = UUID.randomUUID();
        JsonNode idNode = body == null ? null : body.get("id");
        ObjectNode fields = objectOrFail(body);
        if (idNode != null && !idNode.isNull()) {
            Object parsed = Field.uuid("id").required().normalize(idNode, "id", errors);
            if (parsed != null) {
                id = (UUID) parsed;
            }
        }
        fields.remove("id");
        Map<String, Object> data = spec.normalize(fields, "", errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        UUID recordId = id;
        return write(userId, now -> {
            ChangeApplier.Result result = applier.apply(spec, userId, recordId, 0, false, data, now);
            if (result.action() == SyncRules.Action.CONFLICT) {
                throw ApiException.conflict(spec.representation(result.server()));
            }
            StoredRecord saved = repository.find(spec, recordId).orElseThrow();
            return new Tx<>(new Saved(spec.representation(saved), result.written()), result.written());
        });
    }

    public Map<String, Object> update(EntitySpec spec, UUID userId, UUID id, JsonNode body) {
        Map<String, String> errors = new LinkedHashMap<>();
        ObjectNode fields = objectOrFail(body);
        long base = baseVersion(fields.get("baseVersion"), errors);
        fields.remove("baseVersion");
        Map<String, Object> data = spec.normalize(fields, "", errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        return write(userId, now -> new Tx<>(applyUpdate(spec, userId, id, base, data, now), true)).record();
    }

    public void delete(EntitySpec spec, UUID userId, UUID id, String baseVersion) {
        Map<String, String> errors = new LinkedHashMap<>();
        long base = baseVersion == null ? missing(errors)
                : parseLong(baseVersion, "baseVersion", 0, Long.MAX_VALUE, errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        write(userId, now -> {
            visible(spec, userId, id);
            ChangeApplier.Result result = applier.apply(spec, userId, id, base, true, Map.of(), now);
            rejectConflict(spec, result);
            return new Tx<>(new Saved(Map.of(), false), result.written());
        });
    }

    public Map<String, Object> settings(UUID userId) {
        EntitySpec spec = specs.require("settings");
        return write(userId, now -> {
            StoredRecord current = ensureSettings(spec, userId, now);
            return new Tx<>(new Saved(spec.representation(current), false), false);
        }).record();
    }

    public Map<String, Object> updateSettings(UUID userId, JsonNode body) {
        EntitySpec spec = specs.require("settings");
        Map<String, String> errors = new LinkedHashMap<>();
        ObjectNode fields = objectOrFail(body);
        long base = baseVersion(fields.get("baseVersion"), errors);
        fields.remove("baseVersion");
        fields.remove("id");
        Map<String, Object> data = spec.normalize(fields, "", errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        return write(userId, now -> {
            StoredRecord current = ensureSettings(spec, userId, now);
            return new Tx<>(applyUpdate(spec, userId, current.id(), base, data, now), true);
        }).record();
    }

    private Saved applyUpdate(EntitySpec spec, UUID userId, UUID id, long base, Map<String, Object> data, Instant now) {
        visible(spec, userId, id);
        ChangeApplier.Result result = applier.apply(spec, userId, id, base, false, data, now);
        rejectConflict(spec, result);
        return new Saved(spec.representation(repository.find(spec, id).orElseThrow()), false);
    }

    private StoredRecord ensureSettings(EntitySpec spec, UUID userId, Instant now) {
        return repository.findSingleton(spec, userId).orElseGet(() -> {
            UUID id = UUID.randomUUID();
            Map<String, Object> defaults = new LinkedHashMap<>();
            for (Field field : spec.fields()) {
                defaults.put(field.name(), null);
            }
            defaults.put("focusMode", false);
            defaults.put("whatsappOptIn", false);
            defaults.put("language", "fr");
            repository.insert(spec, userId, id, defaults, now);
            return repository.find(spec, id).orElseThrow();
        });
    }

    private void rejectConflict(EntitySpec spec, ChangeApplier.Result result) {
        if (result.action() == SyncRules.Action.CONFLICT) {
            throw ApiException.conflict(spec.representation(result.server()));
        }
    }

    private StoredRecord visible(EntitySpec spec, UUID userId, UUID id) {
        return repository.find(spec, id)
                .filter(r -> r.userId().equals(userId) && !r.deleted())
                .orElseThrow(ApiException::notFound);
    }

    private <T> T write(UUID userId, Function<Instant, Tx<T>> body) {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Tx<T> result = transaction.execute(status -> {
            repository.lockUser(userId);
            if (!users.existsByIdAndStatus(userId, "active")) {
                throw ApiException.unauthorized();
            }
            return body.apply(now);
        });
        if (result.written()) {
            notifier.changesApplied(userId);
        }
        return result.value();
    }

    private static ObjectNode objectOrFail(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw ApiException.validation("body", "Objet JSON attendu");
        }
        return ((ObjectNode) body).deepCopy();
    }

    private static long baseVersion(JsonNode node, Map<String, String> errors) {
        if (node == null || node.isNull()) {
            return missing(errors);
        }
        if (!node.isIntegralNumber() || !node.canConvertToLong() || node.asLong() < 0) {
            errors.put("baseVersion", "Entier positif ou nul attendu");
            return 0L;
        }
        return node.asLong();
    }

    private static long missing(Map<String, String> errors) {
        errors.put("baseVersion", "Champ requis");
        return 0L;
    }

    private static long parseLong(String raw, String name, long min, long max, Map<String, String> errors) {
        try {
            long value = Long.parseLong(raw);
            if (value >= min && value <= max) {
                return value;
            }
        } catch (NumberFormatException ignored) {
            // erreur signalée ci-dessous
        }
        errors.put(name, "Entier entre " + min + " et " + (max == Long.MAX_VALUE ? "illimité" : max) + " attendu");
        return min;
    }
}
