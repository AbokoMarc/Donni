package com.donni.api.whatsapp;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.donni.api.sync.SyncNotifier;
import com.donni.api.sync.SyncRecordRepository;

@Service
public class ReminderDispatcher {

    public record Result(int sent, int failed) {
    }

    private record Due(UUID id, UUID userId, String targetType, String label, String phone, Integer leadMinutes) {
    }

    private static final Logger log = LoggerFactory.getLogger(ReminderDispatcher.class);
    private static final int BATCH_SIZE = 200;
    private static final Duration MAX_LATENESS = Duration.ofHours(24);
    private static final int DEFAULT_LEAD_MINUTES = 10;
    private static final int MAX_LABEL_LENGTH = 200;

    private static final String DUE_SQL = """
            select r.id, r.user_id, r.target_type, r.label, u.phone, t.remind_before_min
            from reminders r
            join users u on u.id = r.user_id and u.status = 'active'
            left join tasks t on r.target_type = 'task' and t.id = r.target_id and t.user_id = r.user_id
            where r.via_whatsapp and r.whatsapp_sent_at is null and r.deleted_at is null and r.status = 'scheduled'
              and r.fire_at <= :now and r.fire_at > :oldest
              and r.target_type in ('task', 'goal', 'habit', 'contact')
              and coalesce((select s.whatsapp_opt_in from user_settings s
                            where s.user_id = r.user_id and s.deleted_at is null
                            order by s.version desc limit 1), false)
            order by r.fire_at
            limit :limit
            """;

    private static final String CLAIM_SQL = """
            update reminders set whatsapp_sent_at = :now, version = nextval('sync_version_seq'), updated_at = :now
            where id = :id and user_id = :userId and via_whatsapp and whatsapp_sent_at is null
              and deleted_at is null and status = 'scheduled'
            """;

    private static final String RELEASE_SQL = """
            update reminders set whatsapp_sent_at = null, version = nextval('sync_version_seq'), updated_at = :now
            where id = :id and user_id = :userId and whatsapp_sent_at = :claimedAt
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final SyncRecordRepository records;
    private final TransactionTemplate transaction;
    private final WhatsAppService whatsApp;
    private final SyncNotifier notifier;
    private final Clock clock;

    public ReminderDispatcher(NamedParameterJdbcTemplate jdbc, SyncRecordRepository records,
                              TransactionTemplate transaction, WhatsAppService whatsApp, SyncNotifier notifier,
                              Clock clock) {
        this.jdbc = jdbc;
        this.records = records;
        this.transaction = transaction;
        this.whatsApp = whatsApp;
        this.notifier = notifier;
        this.clock = clock;
    }

    public Result dispatch() {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        List<Due> due = jdbc.query(DUE_SQL, new MapSqlParameterSource()
                        .addValue("now", utc(now)).addValue("oldest", utc(now.minus(MAX_LATENESS)))
                        .addValue("limit", BATCH_SIZE),
                (rs, i) -> new Due(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getString("target_type"), rs.getString("label"), rs.getString("phone"),
                        (Integer) rs.getObject("remind_before_min")));
        int sent = 0;
        int failed = 0;
        Set<UUID> touchedUsers = new HashSet<>();
        for (Due reminder : due) {
            try {
                if (!claim(reminder, now)) {
                    continue;
                }
                touchedUsers.add(reminder.userId());
                try {
                    send(reminder);
                    sent++;
                } catch (RuntimeException e) {
                    release(reminder, now);
                    failed++;
                    log.warn("Rappel WhatsApp non envoyé ({}) : {}", reminder.targetType(), e.getClass().getSimpleName());
                }
            } catch (RuntimeException e) {
                failed++;
                log.warn("Rappel WhatsApp ignoré : {}", e.getClass().getSimpleName());
            }
        }
        touchedUsers.forEach(notifier::changesApplied);
        return new Result(sent, failed);
    }

    private void send(Due reminder) {
        String label = sanitize(reminder.label());
        switch (reminder.targetType()) {
            case "task" -> {
                int lead = reminder.leadMinutes() != null && reminder.leadMinutes() > 0
                        ? reminder.leadMinutes() : DEFAULT_LEAD_MINUTES;
                whatsApp.send(reminder.userId(), reminder.phone(), WhatsAppTemplate.TASK_REMINDER,
                        List.of(label, String.valueOf(lead)));
            }
            case "goal" -> whatsApp.send(reminder.userId(), reminder.phone(), WhatsAppTemplate.GOAL_REMINDER, List.of(label));
            case "contact" -> whatsApp.send(reminder.userId(), reminder.phone(), WhatsAppTemplate.CONTACT_REMINDER, List.of(label));
            default -> whatsApp.send(reminder.userId(), reminder.phone(), WhatsAppTemplate.ROUTINE_REMINDER, List.of(label));
        }
    }

    private boolean claim(Due reminder, Instant now) {
        Integer updated = transaction.execute(status -> {
            records.lockUser(reminder.userId());
            return jdbc.update(CLAIM_SQL, Map.of("now", utc(now), "id", reminder.id(), "userId", reminder.userId()));
        });
        return updated != null && updated == 1;
    }

    private void release(Due reminder, Instant claimedAt) {
        transaction.executeWithoutResult(status -> {
            records.lockUser(reminder.userId());
            jdbc.update(RELEASE_SQL, Map.of("now", utc(clock.instant()), "id", reminder.id(),
                    "userId", reminder.userId(), "claimedAt", utc(claimedAt)));
        });
    }

    static String sanitize(String label) {
        String flat = label == null ? "" : label.replaceAll("\\s+", " ").strip();
        if (flat.isEmpty()) {
            flat = "-";
        }
        return flat.length() > MAX_LABEL_LENGTH ? flat.substring(0, MAX_LABEL_LENGTH) : flat;
    }

    private static OffsetDateTime utc(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
