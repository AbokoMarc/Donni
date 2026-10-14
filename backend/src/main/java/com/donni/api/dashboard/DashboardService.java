package com.donni.api.dashboard;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {

    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    private static final String TASK_COUNTS = """
            select count(*) filter (where status <> 'skipped') as planned,
                   count(*) filter (where status = 'done') as done
            from tasks where user_id = :userId and day = :today and deleted_at is null
            """;

    private static final String NEXT_TASK = """
            select id, title, start_time from tasks
            where user_id = :userId and day = :today and deleted_at is null
              and status in ('todo', 'doing') and start_time is not null and start_time >= :nowTime
            order by start_time, position, id limit 1
            """;

    private static final String MONEY = """
            select
              coalesce((select sum(a.amount_xof) from accounts a
                        where a.user_id = :userId and a.kind = 'wallet' and a.deleted_at is null), 0)
              + coalesce((select sum(t.amount_xof) from transactions t
                          join accounts a on a.id = t.account_id and a.user_id = t.user_id
                          where t.user_id = :userId and t.deleted_at is null
                            and a.kind = 'wallet' and a.deleted_at is null), 0) as wallet,
              coalesce((select sum(amount_xof) from accounts
                        where user_id = :userId and kind = 'debt' and deleted_at is null), 0) as debt,
              coalesce((select sum(amount_xof) from accounts
                        where user_id = :userId and kind = 'credit' and deleted_at is null), 0) as credit,
              coalesce((select sum(-amount_xof) from transactions
                        where user_id = :userId and deleted_at is null and amount_xof < 0
                          and day >= :monthStart and day < :nextMonthStart), 0) as month_expenses
            """;

    private static final String GOALS = """
            select count(*) as active, coalesce(round(avg(progress)), 0) as average
            from (select case when s.total > 0 then 100.0 * s.done / s.total else coalesce(g.progress_manual, 0) end as progress
                  from goals g
                  left join lateral (select count(*) as total, count(*) filter (where done) as done
                                     from goal_steps where goal_id = g.id and user_id = g.user_id and deleted_at is null) s on true
                  where g.user_id = :userId and g.deleted_at is null and g.status <> 'done') p
            """;

    private static final String ENERGY = """
            select metric, value, target from energy_logs
            where user_id = :userId and day = :today and deleted_at is null
            order by created_at, id
            """;

    private static final String OVERDUE_CONTACTS = """
            select count(*) from contacts
            where user_id = :userId and deleted_at is null and frequency_kind <> 'none'
              and next_contact_at is not null and next_contact_at < :now
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;
    private final ZoneId zone;

    public DashboardService(NamedParameterJdbcTemplate jdbc, Clock clock, ZoneId appZone) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.zone = appZone;
    }

    public Map<String, Object> summary(UUID userId) {
        ZonedDateTime now = clock.instant().atZone(zone);
        LocalDate today = now.toLocalDate();
        LocalDate monthStart = today.withDayOfMonth(1);
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("today", today)
                .addValue("nowTime", now.toLocalTime().format(HHMM))
                .addValue("monthStart", monthStart)
                .addValue("nextMonthStart", monthStart.plusMonths(1))
                .addValue("now", java.time.OffsetDateTime.ofInstant(clock.instant(), java.time.ZoneOffset.UTC));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", today.toString());
        result.put("tasks", tasks(params));
        result.put("money", jdbc.queryForObject(MONEY, params, (rs, i) -> {
            Map<String, Object> money = new LinkedHashMap<>();
            money.put("walletBalanceXof", rs.getLong("wallet"));
            money.put("debtXof", rs.getLong("debt"));
            money.put("creditXof", rs.getLong("credit"));
            money.put("monthExpensesXof", rs.getLong("month_expenses"));
            return money;
        }));
        result.put("goals", jdbc.queryForObject(GOALS, params, (rs, i) -> {
            Map<String, Object> goals = new LinkedHashMap<>();
            goals.put("active", rs.getLong("active"));
            goals.put("averageProgress", rs.getLong("average"));
            return goals;
        }));
        result.put("energy", Map.of("today", energy(params)));
        result.put("network", Map.of("overdueContacts", jdbc.queryForObject(OVERDUE_CONTACTS, params, Long.class)));
        return result;
    }

    private Map<String, Object> tasks(MapSqlParameterSource params) {
        Map<String, Object> counts = jdbc.queryForMap(TASK_COUNTS, params);
        Map<String, Object> tasks = new LinkedHashMap<>();
        tasks.put("planned", counts.get("planned"));
        tasks.put("done", counts.get("done"));
        List<Map<String, Object>> next = jdbc.query(NEXT_TASK, params, (rs, i) -> {
            Map<String, Object> task = new LinkedHashMap<>();
            task.put("id", rs.getObject("id", UUID.class).toString());
            task.put("title", rs.getString("title"));
            task.put("startTime", rs.getString("start_time"));
            return task;
        });
        tasks.put("nextTask", next.isEmpty() ? null : next.get(0));
        return tasks;
    }

    private List<Map<String, Object>> energy(MapSqlParameterSource params) {
        return jdbc.query(ENERGY, params, (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("metric", rs.getString("metric"));
            row.put("value", rs.getBigDecimal("value") == null ? null : rs.getBigDecimal("value").doubleValue());
            row.put("target", rs.getBigDecimal("target") == null ? null : rs.getBigDecimal("target").doubleValue());
            return row;
        });
    }
}
