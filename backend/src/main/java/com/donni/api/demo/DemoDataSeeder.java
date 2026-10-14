package com.donni.api.demo;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.donni.api.auth.User;
import com.donni.api.auth.UserRepository;
import com.donni.api.sync.EntitySpec;
import com.donni.api.sync.EntitySpecs;
import com.donni.api.sync.SyncRecordRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@Profile("demo")
public class DemoDataSeeder implements ApplicationRunner {

    static final String PHONE = "+237600000000";

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final EntitySpecs specs;
    private final SyncRecordRepository repository;
    private final TransactionTemplate transaction;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final ZoneId zone;
    private final String password;

    public DemoDataSeeder(UserRepository users, PasswordEncoder encoder, EntitySpecs specs,
                          SyncRecordRepository repository, TransactionTemplate transaction, ObjectMapper mapper,
                          Clock clock, ZoneId appZone, @Value("${DEMO_PASSWORD}") String password) {
        this.users = users;
        this.encoder = encoder;
        this.specs = specs;
        this.repository = repository;
        this.transaction = transaction;
        this.mapper = mapper;
        this.clock = clock;
        this.zone = appZone;
        if (password == null || password.length() < 8) {
            throw new IllegalStateException("DEMO_PASSWORD est obligatoire et doit contenir au moins 8 caractères");
        }
        this.password = password;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (users.findByPhone(PHONE).isPresent()) {
            log.info("Données de démonstration déjà présentes");
            return;
        }
        String hash = encoder.encode(password);
        transaction.executeWithoutResult(status -> {
            User marc = users.save(new User("Marc", PHONE, hash));
            repository.lockUser(marc.getId());
            seed(marc.getId());
        });
        log.info("Données de démonstration créées pour {}", PHONE);
    }

    private void seed(UUID userId) {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        LocalDate today = LocalDate.now(clock.withZone(zone));
        Seeder seeder = new Seeder(userId, now);

        UUID wallet = seeder.add("accounts", row("label", "Mobile Money", "kind", "wallet", "provider", "Orange Money",
                "amountXof", 10_900, "note", "Compte principal"));
        seeder.add("accounts", row("label", "Dette", "kind", "debt", "amountXof", -3_200, "counterparty", "Moussa",
                "dueDate", today.plusDays(14).toString(), "note", "Remboursement prévu"));
        seeder.add("accounts", row("label", "Crédit", "kind", "credit", "amountXof", 1_000, "counterparty", "Ibrahim",
                "dueDate", today.plusDays(7).toString(), "note", "Remboursement attendu"));

        seeder.add("transactions", row("accountId", wallet.toString(), "day", today.minusDays(5).toString(),
                "label", "Salaire", "amountXof", 5_000, "category", "revenus"));
        seeder.add("transactions", row("accountId", wallet.toString(), "day", today.minusDays(4).toString(),
                "label", "Loyer", "amountXof", -2_200, "category", "logement"));
        seeder.add("transactions", row("accountId", wallet.toString(), "day", today.minusDays(1).toString(),
                "label", "Épicerie", "amountXof", -1_200, "category", "alimentation"));

        String month = today.format(DateTimeFormatter.ofPattern("yyyy-MM"));
        seeder.add("budgets", row("month", month, "limitXof", 12_000, "alertedLevel", 0));
        seeder.add("budgets", row("month", month, "category", "alimentation", "limitXof", 4_000, "alertedLevel", 0));

        UUID chef = seeder.add("goals", row("title", "Devenir chef projet 2026", "status", "doing",
                "dueDate", "2026-06-30", "notes", "Formation, certification et portfolio."));
        String[] steps = {"Formation", "Certification", "Projet personnel", "Portfolio", "Candidatures"};
        for (int i = 0; i < steps.length; i++) {
            seeder.add("goalSteps", row("goalId", chef.toString(), "title", steps[i], "done", i == 0, "position", i));
        }
        seeder.add("goals", row("title", "Lancer business traduction", "status", "todo", "dueDate", "2026-09-15",
                "progressManual", 0));

        UUID maman = seeder.add("contacts", row("name", "Maman", "relation", "famille", "frequencyKind", "weekly",
                "frequencyDay", 0, "frequencyTime", "10:00", "lastContactAt", now.minus(Duration.ofDays(4)).toString(),
                "nextContactAt", now.plus(Duration.ofDays(3)).toString(), "note", "Appel du dimanche"));
        seeder.add("contacts", row("name", "Dr Njoya", "relation", "autre", "frequencyKind", "none",
                "note", "Suivi médical"));
        seeder.add("contacts", row("name", "Client Alpha", "relation", "client", "frequencyKind", "monthly",
                "frequencyDay", 1, "frequencyTime", "10:00", "lastContactAt", now.minus(Duration.ofDays(30)).toString(),
                "nextContactAt", now.minus(Duration.ofDays(2)).toString()));
        seeder.add("contactInteractions", row("contactId", maman.toString(), "at", now.minus(Duration.ofDays(4)).toString(),
                "channel", "call"));

        seeder.add("energy", row("day", today.toString(), "metric", "sleep", "label", "Sommeil", "value", 5.5,
                "target", 6, "unit", "h"));
        seeder.add("energy", row("day", today.toString(), "metric", "mood", "label", "Humeur", "valueText", "Calme"));
        seeder.add("energy", row("day", today.toString(), "metric", "sport", "label", "Sport", "value", 3,
                "target", 4, "unit", "séances"));
        seeder.add("energy", row("day", today.toString(), "metric", "water", "label", "Eau", "value", 5,
                "target", 8, "unit", "verres"));

        seeder.add("skills", row("name", "Productivité", "level", 55, "monthlyTargetXof", 200_000));

        seeder.add("tasks", row("title", "Rituel matin", "kind", "routine", "day", today.toString(),
                "startTime", "07:00", "endTime", "09:00", "durationMin", 120, "priority", 1, "status", "done",
                "position", 0, "recurrence", "daily"));
        UUID deepWork = seeder.add("tasks", row("title", "Deep work · Projet Alpha", "kind", "focus",
                "day", today.toString(), "startTime", "09:00", "endTime", "10:30", "durationMin", 90, "priority", 2,
                "status", "doing", "position", 1, "goalId", chef.toString(), "remindBeforeMin", 10));
        seeder.add("tasks", row("title", "Appel équipe", "kind", "event", "day", today.toString(),
                "startTime", "10:30", "endTime", "12:00", "durationMin", 90, "priority", 1, "status", "todo",
                "position", 2));

        seeder.add("reminders", row("targetType", "task", "targetId", deepWork.toString(),
                "label", "Deep work · Projet Alpha", "fireAt", today.atTime(LocalTime.of(8, 50)).atZone(zone).toInstant().toString(),
                "status", "scheduled", "viaWhatsapp", false));

        UUID reading = seeder.add("habits", row("title", "Lecture 20 minutes", "cadence", "daily",
                "targetPerPeriod", 1, "remindAt", "21:00", "archived", false));
        seeder.add("habitLogs", row("habitId", reading.toString(), "day", today.minusDays(1).toString(), "count", 1));

        seeder.add("notes", row("title", "Projet Alpha", "body", "Préparer le point d'avancement du jeudi."));
        seeder.add("settings", row("focusMode", false, "whatsappOptIn", false, "language", "fr",
                "quietStart", "22:00", "quietEnd", "06:30", "dailyBriefAt", "07:00"));
    }

    private static Map<String, Object> row(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }

    private final class Seeder {

        private final UUID userId;
        private final Instant now;

        Seeder(UUID userId, Instant now) {
            this.userId = userId;
            this.now = now;
        }

        UUID add(String entity, Map<String, Object> values) {
            EntitySpec spec = specs.require(entity);
            Map<String, String> errors = new LinkedHashMap<>();
            Map<String, Object> data = spec.normalize(mapper.valueToTree(values), "", errors);
            if (!errors.isEmpty()) {
                throw new IllegalStateException("Donnée de démonstration invalide (" + entity + ") : " + errors);
            }
            UUID id = UUID.randomUUID();
            repository.insert(spec, userId, id, data, now);
            return id;
        }
    }
}
