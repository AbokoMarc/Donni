package com.donni.api.sync;

import java.util.Map;

public final class SyncRules {

    public enum Action { INSERT, UPDATE, TOMBSTONE, UNCHANGED, CONFLICT, NOOP_DELETE }

    public record Stored(long version, boolean deleted, Map<String, Object> data) {

        public static Stored of(StoredRecord record) {
            return new Stored(record.version(), record.deleted(), record.data());
        }
    }

    public record Incoming(long baseVersion, boolean deleted, Map<String, Object> data) {
    }

    private SyncRules() {
    }

    public static Action decide(Stored stored, Incoming incoming) {
        if (stored == null) {
            return incoming.deleted() ? Action.NOOP_DELETE : Action.INSERT;
        }
        if (incoming.baseVersion() == stored.version()) {
            if (incoming.deleted()) {
                return stored.deleted() ? Action.UNCHANGED : Action.TOMBSTONE;
            }
            return Action.UPDATE;
        }
        boolean retry = incoming.deleted()
                ? stored.deleted()
                : !stored.deleted() && stored.data().equals(incoming.data());
        return retry ? Action.UNCHANGED : Action.CONFLICT;
    }
}
