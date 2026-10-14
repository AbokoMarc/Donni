package com.donni.api.sync;

import java.util.stream.Collectors;

/** SQL généré une fois par entité à partir de son {@link EntitySpec}. */
public final class RecordSql {

    private static final String NEXT_VERSION = "nextval('sync_version_seq')";

    private final String select;
    private final String insert;
    private final String update;
    private final String tombstone;
    private final String pull;
    private final String singleton;

    public RecordSql(EntitySpec spec) {
        String table = spec.table();
        String columns = spec.fields().stream().map(f -> quote(f.column())).collect(Collectors.joining(", "));
        String values = spec.fields().stream().map(RecordSql::placeholder).collect(Collectors.joining(", "));
        String assignments = spec.fields().stream()
                .map(f -> quote(f.column()) + " = " + placeholder(f)).collect(Collectors.joining(", "));

        this.select = "select * from " + table + " where id = :id";
        this.insert = "insert into " + table + " (id, user_id, version, created_at, updated_at, deleted_at, " + columns
                + ") values (:id, :userId, " + NEXT_VERSION + ", :now, :now, null, " + values + ") returning version";
        this.update = "update " + table + " set version = " + NEXT_VERSION + ", updated_at = :now, deleted_at = null, "
                + assignments + " where id = :id and user_id = :userId returning version";
        this.tombstone = "update " + table + " set version = " + NEXT_VERSION
                + ", updated_at = :now, deleted_at = :now where id = :id and user_id = :userId returning version";
        this.pull = "select * from " + table + " where user_id = :userId and version > :cursor order by version limit :limit";
        this.singleton = "select * from " + table
                + " where user_id = :userId and deleted_at is null order by version desc limit 1";
    }

    public String select() {
        return select;
    }

    public String insert() {
        return insert;
    }

    public String update() {
        return update;
    }

    public String tombstone() {
        return tombstone;
    }

    public String pull() {
        return pull;
    }

    public String singleton() {
        return singleton;
    }

    public static String param(Field field) {
        return "p_" + field.name();
    }

    private static String placeholder(Field field) {
        String name = ":" + param(field);
        return field.isJson() ? "cast(" + name + " as jsonb)" : name;
    }

    private static String quote(String column) {
        return '"' + column + '"';
    }
}
