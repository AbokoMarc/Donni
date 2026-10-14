package com.donni.api.sync;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

import com.donni.api.common.ApiException;

/** Applique une modification à un enregistrement ; l'appelant détient déjà le verrou de l'utilisateur. */
@Component
public class ChangeApplier {

    public record Result(SyncRules.Action action, long version, StoredRecord server) {

        public boolean written() {
            return action == SyncRules.Action.INSERT || action == SyncRules.Action.UPDATE
                    || action == SyncRules.Action.TOMBSTONE;
        }
    }

    private final SyncRecordRepository repository;

    public ChangeApplier(SyncRecordRepository repository) {
        this.repository = repository;
    }

    public Result apply(EntitySpec spec, UUID userId, UUID id, long baseVersion, boolean deleted,
                        Map<String, Object> data, Instant now) {
        StoredRecord existing = repository.find(spec, id).orElse(null);
        if (existing != null && !existing.userId().equals(userId)) {
            throw ApiException.forbidden();
        }
        SyncRules.Stored stored = existing == null ? null : SyncRules.Stored.of(existing);
        SyncRules.Action action = SyncRules.decide(stored, new SyncRules.Incoming(baseVersion, deleted, data));
        try {
            return switch (action) {
                case INSERT -> new Result(action, repository.insert(spec, userId, id, data, now), null);
                case UPDATE -> new Result(action, repository.update(spec, userId, id, data, now), null);
                case TOMBSTONE -> new Result(action, repository.tombstone(spec, userId, id, now), null);
                case UNCHANGED -> new Result(action, existing.version(), null);
                case CONFLICT -> new Result(action, existing.version(), existing);
                case NOOP_DELETE -> new Result(action, 0L, null);
            };
        } catch (DuplicateKeyException e) {
            throw ApiException.forbidden();
        }
    }
}
