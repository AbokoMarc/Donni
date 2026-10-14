package com.donni.api.sync;

import static com.donni.api.sync.EntitySpec.Filter.contains;
import static com.donni.api.sync.EntitySpec.Filter.eq;
import static com.donni.api.sync.EntitySpec.Filter.from;
import static com.donni.api.sync.EntitySpec.Filter.to;
import static com.donni.api.sync.Field.bigint;
import static com.donni.api.sync.Field.bool;
import static com.donni.api.sync.Field.choice;
import static com.donni.api.sync.Field.date;
import static com.donni.api.sync.Field.instant;
import static com.donni.api.sync.Field.integer;
import static com.donni.api.sync.Field.json;
import static com.donni.api.sync.Field.numeric;
import static com.donni.api.sync.Field.text;
import static com.donni.api.sync.Field.time;
import static com.donni.api.sync.Field.uuid;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;

@Component
public class EntitySpecs {

    private static final int LONG_TEXT = 10_000;
    private static final int BODY_TEXT = 100_000;

    private final List<EntitySpec> all = List.of(
            EntitySpec.named("tasks", "tasks", "tasks")
                    .fields(text("title").required().nonBlank(),
                            text("notes").maxLength(LONG_TEXT),
                            choice("kind", "task", "routine", "focus", "break", "event").required(),
                            date("day").required(),
                            time("startTime"),
                            time("endTime"),
                            integer("durationMin").range(0, 100_000L),
                            integer("priority").range(0, 2L).required(),
                            choice("status", "todo", "doing", "done", "skipped").required(),
                            integer("position").required(),
                            text("recurrence").matching("^(daily|weekdays|weekly:[0-6](,[0-6]){0,6})$"),
                            uuid("goalId"),
                            integer("remindBeforeMin").range(0, 100_000L))
                    .filters(eq("day", "day"))
                    .orderBy("day, start_time nulls last, position")
                    .build(),
            EntitySpec.named("reminders", "reminders", "reminders")
                    .fields(choice("targetType", "task", "goal", "habit", "contact", "budget", "custom").required(),
                            uuid("targetId"),
                            text("label").required().nonBlank(),
                            instant("fireAt").required(),
                            choice("status", "scheduled", "fired", "dismissed", "snoozed").required(),
                            bool("viaWhatsapp").required(),
                            instant("whatsappSentAt"))
                    .orderBy("fire_at")
                    .build(),
            EntitySpec.named("goals", "goals", "goals")
                    .fields(text("title").required().nonBlank(),
                            choice("status", "todo", "doing", "done").required(),
                            date("dueDate"),
                            text("notes").maxLength(LONG_TEXT),
                            integer("progressManual").range(0, 100L))
                    .build(),
            EntitySpec.named("goalSteps", "goal-steps", "goal_steps")
                    .fields(uuid("goalId").required(),
                            text("title").required().nonBlank(),
                            bool("done").required(),
                            integer("position").required())
                    .filters(eq("goalId", "goalId"))
                    .orderBy("position")
                    .build(),
            EntitySpec.named("habits", "habits", "habits")
                    .fields(text("title").required().nonBlank(),
                            choice("cadence", "daily", "weekly").required(),
                            integer("targetPerPeriod").range(1, null).required(),
                            time("remindAt"),
                            uuid("goalId"),
                            bool("archived").required())
                    .build(),
            EntitySpec.named("habitLogs", "habit-logs", "habit_logs")
                    .fields(uuid("habitId").required(),
                            date("day").required(),
                            integer("count").range(0, null).required())
                    .filters(eq("habitId", "habitId"))
                    .orderBy("day desc")
                    .build(),
            EntitySpec.named("accounts", "accounts", "accounts")
                    .fields(text("label").required().nonBlank(),
                            choice("kind", "wallet", "debt", "credit").required(),
                            text("provider"),
                            bigint("amountXof").required(),
                            text("counterparty"),
                            date("dueDate"),
                            text("note").maxLength(LONG_TEXT))
                    .build(),
            EntitySpec.named("transactions", "transactions", "transactions")
                    .fields(uuid("accountId"),
                            date("day").required(),
                            text("label").required().nonBlank(),
                            bigint("amountXof").required(),
                            choice("category", "alimentation", "transport", "logement", "sante", "etudes", "travail",
                                    "loisirs", "famille", "abonnements", "revenus", "autres").required(),
                            text("note").maxLength(LONG_TEXT))
                    .filters(from("from", "day"), to("to", "day"), eq("category", "category"),
                            contains("q", "label", "note"))
                    .orderBy("day desc, created_at desc")
                    .build(),
            EntitySpec.named("budgets", "budgets", "budgets")
                    .fields(text("month").required().matching("^[0-9]{4}-(0[1-9]|1[0-2])$"),
                            text("category"),
                            bigint("limitXof").range(1, null).required(),
                            integer("alertedLevel").oneOf(0L, 80L, 100L).required())
                    .filters(eq("month", "month"))
                    .orderBy("month desc")
                    .build(),
            EntitySpec.named("energy", "energy", "energy_logs")
                    .fields(date("day").required(),
                            text("metric").required().nonBlank(),
                            text("label").required().nonBlank(),
                            numeric("value"),
                            text("valueText"),
                            numeric("target"),
                            text("unit"))
                    .filters(eq("day", "day"))
                    .orderBy("day desc, created_at")
                    .build(),
            EntitySpec.named("contacts", "contacts", "contacts")
                    .fields(text("name").required().nonBlank(),
                            choice("relation", "famille", "ami", "mentor", "collegue", "client", "partenaire", "autre")
                                    .required(),
                            text("phone").maxLength(50),
                            text("note").maxLength(LONG_TEXT),
                            choice("frequencyKind", "none", "weekly", "biweekly", "monthly").required(),
                            integer("frequencyDay"),
                            time("frequencyTime"),
                            instant("lastContactAt"),
                            instant("nextContactAt"))
                    .crossCheck(EntitySpecs::checkContactFrequency)
                    .orderBy("name")
                    .build(),
            EntitySpec.named("contactInteractions", "contact-interactions", "contact_interactions")
                    .fields(uuid("contactId").required(),
                            instant("at").required(),
                            choice("channel", "call", "whatsapp", "meeting", "other").required(),
                            text("note").maxLength(LONG_TEXT))
                    .filters(eq("contactId", "contactId"))
                    .orderBy("at desc")
                    .build(),
            EntitySpec.named("skills", "skills", "skills")
                    .fields(text("name").required().nonBlank(),
                            integer("level").range(0, 100L).required(),
                            bigint("monthlyTargetXof").range(0, null),
                            text("note").maxLength(LONG_TEXT))
                    .orderBy("name")
                    .build(),
            EntitySpec.named("notes", "notes", "notes")
                    .fields(text("title").required().maxLength(500),
                            text("body").required().maxLength(BODY_TEXT),
                            text("targetType"),
                            uuid("targetId"))
                    .orderBy("updated_at desc")
                    .build(),
            EntitySpec.named("weeklyReviews", "weekly-reviews", "weekly_reviews")
                    .fields(date("weekStart").required(),
                            json("payload").required())
                    .orderBy("week_start desc")
                    .build(),
            EntitySpec.named("settings", "settings", "user_settings")
                    .fields(bool("focusMode").required(),
                            bool("whatsappOptIn").required(),
                            text("language").required().nonBlank().maxLength(20),
                            time("quietStart"),
                            time("quietEnd"),
                            time("dailyBriefAt"))
                    .build());

    private final Map<String, EntitySpec> byProtocol = new LinkedHashMap<>();
    private final Map<String, EntitySpec> byRest = new LinkedHashMap<>();

    public EntitySpecs() {
        all.forEach(spec -> {
            byProtocol.put(spec.protocolName(), spec);
            byRest.put(spec.restName(), spec);
        });
    }

    public List<EntitySpec> all() {
        return all;
    }

    public Optional<EntitySpec> protocol(String name) {
        return Optional.ofNullable(byProtocol.get(name));
    }

    public Optional<EntitySpec> rest(String name) {
        return Optional.ofNullable(byRest.get(name));
    }

    public EntitySpec require(String protocolName) {
        return protocol(protocolName).orElseThrow(() -> new IllegalArgumentException(protocolName));
    }

    private static void checkContactFrequency(Map<String, Object> data, String prefix, Map<String, String> errors) {
        Object kind = data.get("frequencyKind");
        Object day = data.get("frequencyDay");
        if (day == null || "none".equals(kind)) {
            return;
        }
        long value = (Long) day;
        String key = prefix.isEmpty() ? "frequencyDay" : prefix + ".frequencyDay";
        if ("monthly".equals(kind) && (value < 1 || value > 28)) {
            errors.put(key, "Jour du mois entre 1 et 28");
        } else if (!"monthly".equals(kind) && (value < 0 || value > 6)) {
            errors.put(key, "Jour de la semaine entre 0 et 6");
        }
    }
}
