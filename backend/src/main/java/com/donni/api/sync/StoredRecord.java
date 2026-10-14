package com.donni.api.sync;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record StoredRecord(UUID id, UUID userId, long version, Instant createdAt, Instant updatedAt, Instant deletedAt,
                           Map<String, Object> data) {

    public boolean deleted() {
        return deletedAt != null;
    }
}
