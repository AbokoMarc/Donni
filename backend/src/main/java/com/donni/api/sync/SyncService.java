package com.donni.api.sync;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.donni.api.auth.UserRepository;
import com.donni.api.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;

@Service
public class SyncService {

    static final int PAGE_SIZE = 200;

    private record Outcome(SyncResponse response, boolean written) {
    }

    private final EntitySpecs specs;
    private final SyncRecordRepository repository;
    private final ChangeApplier applier;
    private final UserRepository users;
    private final TransactionTemplate transaction;
    private final SyncNotifier notifier;
    private final Clock clock;

    public SyncService(EntitySpecs specs, SyncRecordRepository repository, ChangeApplier applier, UserRepository users,
                       TransactionTemplate transaction, SyncNotifier notifier, Clock clock) {
        this.specs = specs;
        this.repository = repository;
        this.applier = applier;
        this.users = users;
        this.transaction = transaction;
        this.notifier = notifier;
        this.clock = clock;
    }

    public SyncResponse sync(UUID userId, JsonNode body) {
        SyncRequestParser.ParsedRequest request = SyncRequestParser.parse(body, specs);
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Outcome outcome = transaction.execute(status -> run(userId, request, now));
        if (outcome.written()) {
            notifier.changesApplied(userId);
        }
        return outcome.response();
    }

    private Outcome run(UUID userId, SyncRequestParser.ParsedRequest request, Instant now) {
        repository.lockUser(userId);
        if (!users.existsByIdAndStatus(userId, "active")) {
            throw ApiException.unauthorized();
        }
        List<SyncResponse.Applied> applied = new ArrayList<>();
        List<SyncResponse.Conflict> conflicts = new ArrayList<>();
        Set<String> appliedKeys = new HashSet<>();
        Map<String, Integer> appliedPerEntity = new HashMap<>();
        long maxApplied = 0;
        boolean written = false;

        for (SyncRequestParser.ParsedChange change : request.changes()) {
            EntitySpec spec = change.spec();
            ChangeApplier.Result result = applier.apply(spec, userId, change.id(), change.baseVersion(),
                    change.deleted(), change.data(), now);
            if (result.action() == SyncRules.Action.CONFLICT) {
                conflicts.add(new SyncResponse.Conflict(spec.protocolName(), change.id().toString(),
                        serverState(spec, result.server())));
                continue;
            }
            applied.add(new SyncResponse.Applied(spec.protocolName(), change.id().toString(), result.version()));
            appliedKeys.add(key(spec, change.id()));
            appliedPerEntity.merge(spec.protocolName(), 1, Integer::sum);
            maxApplied = Math.max(maxApplied, result.version());
            written |= result.written();
        }

        List<SyncResponse.Change> pulled = new ArrayList<>();
        for (EntitySpec spec : specs.all()) {
            int limit = PAGE_SIZE + 1 + appliedPerEntity.getOrDefault(spec.protocolName(), 0);
            for (StoredRecord record : repository.pull(spec, userId, request.cursor(), limit)) {
                if (!appliedKeys.contains(key(spec, record.id()))) {
                    pulled.add(change(spec, record));
                }
            }
        }
        pulled.sort(Comparator.comparingLong(SyncResponse.Change::version));

        boolean hasMore = pulled.size() > PAGE_SIZE;
        List<SyncResponse.Change> page = hasMore ? new ArrayList<>(pulled.subList(0, PAGE_SIZE)) : pulled;
        long cursor = request.cursor();
        if (!page.isEmpty()) {
            cursor = Math.max(cursor, page.get(page.size() - 1).version());
        }
        if (!hasMore) {
            cursor = Math.max(cursor, maxApplied);
        }
        return new Outcome(new SyncResponse(cursor, hasMore, applied, conflicts, page), written);
    }

    private static String key(EntitySpec spec, UUID id) {
        return spec.protocolName() + ":" + id;
    }

    private static SyncResponse.ServerState serverState(EntitySpec spec, StoredRecord record) {
        return new SyncResponse.ServerState(record.version(), record.deleted(), stateData(spec, record));
    }

    private static SyncResponse.Change change(EntitySpec spec, StoredRecord record) {
        return new SyncResponse.Change(spec.protocolName(), record.id().toString(), record.version(), record.deleted(),
                stateData(spec, record));
    }

    private static Map<String, Object> stateData(EntitySpec spec, StoredRecord record) {
        return record.deleted() ? Map.of() : spec.dataToJson(record.data());
    }
}
