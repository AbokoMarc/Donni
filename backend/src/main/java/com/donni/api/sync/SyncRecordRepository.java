package com.donni.api.sync;

import java.io.IOException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Les seize tables synchronisées partagent le même modèle (id, user_id, version, tombstone) et ne diffèrent que par
 * leurs colonnes métier, déjà décrites par {@link EntitySpec}. Un dépôt JDBC piloté par ce registre évite seize
 * entités JPA identiques et garantit que /sync et les routes REST appliquent exactement les mêmes règles, avec un
 * contrôle direct de la séquence de versions et des verrous.
 */
@Repository
public class SyncRecordRepository {

    public record ListQuery(Long updatedSince, Map<String, Object> filters, int limit, int offset) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Map<String, RecordSql> sqlCache = new ConcurrentHashMap<>();

    public SyncRecordRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public void lockUser(UUID userId) {
        jdbc.queryForObject("select count(*) from (select pg_advisory_xact_lock(hashtextextended(:id, 0))) locked",
                Map.of("id", userId.toString()), Long.class);
    }

    public Optional<StoredRecord> find(EntitySpec spec, UUID id) {
        return jdbc.query(sql(spec).select(), Map.of("id", id), mapper(spec)).stream().findFirst();
    }

    public Optional<StoredRecord> findSingleton(EntitySpec spec, UUID userId) {
        return jdbc.query(sql(spec).singleton(), Map.of("userId", userId), mapper(spec)).stream().findFirst();
    }

    public long insert(EntitySpec spec, UUID userId, UUID id, Map<String, Object> data, Instant now) {
        return writeReturningVersion(sql(spec).insert(), spec, userId, id, data, now);
    }

    public long update(EntitySpec spec, UUID userId, UUID id, Map<String, Object> data, Instant now) {
        return writeReturningVersion(sql(spec).update(), spec, userId, id, data, now);
    }

    public long tombstone(EntitySpec spec, UUID userId, UUID id, Instant now) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("id", id).addValue("userId", userId).addValue("now", utc(now));
        return jdbc.queryForObject(sql(spec).tombstone(), params, Long.class);
    }

    public List<StoredRecord> pull(EntitySpec spec, UUID userId, long cursor, int limit) {
        return jdbc.query(sql(spec).pull(), new MapSqlParameterSource()
                .addValue("userId", userId).addValue("cursor", cursor).addValue("limit", limit), mapper(spec));
    }

    public List<StoredRecord> list(EntitySpec spec, UUID userId, ListQuery query) {
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("userId", userId);
        StringBuilder sql = new StringBuilder("select * from ").append(spec.table())
                .append(" where user_id = :userId and deleted_at is null");
        if (query.updatedSince() != null) {
            sql.append(" and version > :since");
            params.addValue("since", query.updatedSince());
        }
        for (EntitySpec.Filter filter : spec.filters()) {
            Object value = query.filters().get(filter.param());
            if (value == null) {
                continue;
            }
            appendFilter(sql, params, spec, filter, value);
        }
        sql.append(" order by ").append(query.updatedSince() != null ? "version" : spec.defaultOrder())
                .append(", id limit :limit offset :offset");
        params.addValue("limit", query.limit()).addValue("offset", query.offset());
        return jdbc.query(sql.toString(), params, mapper(spec));
    }

    private void appendFilter(StringBuilder sql, MapSqlParameterSource params, EntitySpec spec,
                              EntitySpec.Filter filter, Object value) {
        String name = "f_" + filter.param();
        Field first = spec.field(filter.fields().get(0));
        if (filter.op() == EntitySpec.FilterOp.CONTAINS) {
            String escaped = value.toString().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
            params.addValue(name, "%" + escaped + "%");
            List<String> clauses = new ArrayList<>();
            for (String fieldName : filter.fields()) {
                clauses.add("\"" + spec.field(fieldName).column() + "\" ilike :" + name + " escape '\\'");
            }
            sql.append(" and (").append(String.join(" or ", clauses)).append(")");
            return;
        }
        String operator = switch (filter.op()) {
            case FROM -> ">=";
            case TO -> "<=";
            default -> "=";
        };
        params.addValue(name, first.toSql(value));
        sql.append(" and \"").append(first.column()).append("\" ").append(operator).append(" :").append(name);
    }

    private long writeReturningVersion(String sql, EntitySpec spec, UUID userId, UUID id, Map<String, Object> data,
                                       Instant now) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("id", id).addValue("userId", userId).addValue("now", utc(now));
        for (Field field : spec.fields()) {
            params.addValue(RecordSql.param(field), field.toSql(data.get(field.name())));
        }
        return jdbc.queryForObject(sql, params, Long.class);
    }

    private RecordSql sql(EntitySpec spec) {
        return sqlCache.computeIfAbsent(spec.table(), t -> new RecordSql(spec));
    }

    private RowMapper<StoredRecord> mapper(EntitySpec spec) {
        return (rs, rowNum) -> {
            Map<String, Object> data = new LinkedHashMap<>();
            for (Field field : spec.fields()) {
                data.put(field.name(), read(rs, field));
            }
            return new StoredRecord(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                    rs.getLong("version"), instant(rs, "created_at"), instant(rs, "updated_at"),
                    instant(rs, "deleted_at"), data);
        };
    }

    private Object read(ResultSet rs, Field field) throws SQLException {
        Object raw = rs.getObject(field.column());
        if (raw == null) {
            return null;
        }
        return switch (field.type()) {
            case INT, LONG -> ((Number) raw).longValue();
            case BOOL -> (Boolean) raw;
            case DATE -> rs.getObject(field.column(), LocalDate.class);
            case INSTANT -> rs.getObject(field.column(), OffsetDateTime.class).toInstant();
            case NUMERIC -> rs.getBigDecimal(field.column()).setScale(2, java.math.RoundingMode.HALF_UP);
            case UUID -> rs.getObject(field.column(), UUID.class);
            case JSON -> parseJson(rs.getString(field.column()));
            default -> rs.getString(field.column());
        };
    }

    private Object parseJson(String text) {
        try {
            return mapper.readTree(text);
        } catch (IOException e) {
            throw new IllegalStateException("JSON stocké illisible", e);
        }
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static OffsetDateTime utc(Instant instant) {
        return OffsetDateTime.ofInstant(instant, java.time.ZoneOffset.UTC);
    }
}
