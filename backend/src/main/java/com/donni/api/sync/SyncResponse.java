package com.donni.api.sync;

import java.util.List;
import java.util.Map;

public record SyncResponse(long cursor, boolean hasMore, List<Applied> applied, List<Conflict> conflicts,
                           List<Change> changes) {

    public record Applied(String entity, String id, long version) {
    }

    public record ServerState(long version, boolean deleted, Map<String, Object> data) {
    }

    public record Conflict(String entity, String id, ServerState server) {
    }

    public record Change(String entity, String id, long version, boolean deleted, Map<String, Object> data) {
    }
}
