-- Schéma initial DONNI.
--
-- Les tables "synchronisées" partagent les colonnes id / user_id / version /
-- created_at / updated_at / deleted_at. L'identifiant est produit par le client
-- (UUID) afin de pouvoir créer des données hors connexion. Aucune clé étrangère
-- n'existe entre tables synchronisées : un lot de synchronisation peut contenir
-- l'enfant avant le parent.

create sequence sync_version_seq;

-- Comptes et sessions

create table users (
    id            uuid primary key default gen_random_uuid(),
    full_name     text        not null,
    phone         text        not null,
    password_hash text        not null,
    status        text        not null default 'active' check (status in ('active', 'disabled')),
    created_at    timestamptz not null default now(),
    last_login_at timestamptz
);
create unique index users_phone_key on users (phone);

create table refresh_tokens (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid        not null references users (id) on delete cascade,
    family_id   uuid        not null,
    token_hash  text        not null,
    device_id   uuid,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null,
    used_at     timestamptz,
    revoked_at  timestamptz
);
create unique index refresh_tokens_hash_key on refresh_tokens (token_hash);
create index refresh_tokens_user_idx on refresh_tokens (user_id);
create index refresh_tokens_family_idx on refresh_tokens (family_id);

create table password_resets (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references users (id) on delete cascade,
    code_hash  text        not null,
    attempts   smallint    not null default 0,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at    timestamptz
);
create index password_resets_user_idx on password_resets (user_id, created_at desc);

create table devices (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid        not null references users (id) on delete cascade,
    fcm_token    text        not null,
    platform     text        not null default 'android',
    app_version  text,
    created_at   timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);
create unique index devices_token_key on devices (fcm_token);
create index devices_user_idx on devices (user_id);

-- Notifications distantes

create table notification_preferences (
    user_id uuid    not null references users (id) on delete cascade,
    channel text    not null check (channel in ('fcm', 'whatsapp')),
    type    text    not null,
    enabled boolean not null default true,
    primary key (user_id, channel, type)
);

create table notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references users (id) on delete cascade,
    channel    text        not null check (channel in ('fcm', 'whatsapp')),
    type       text        not null,
    title      text        not null,
    body       text        not null,
    data       jsonb       not null default '{}'::jsonb,
    status     text        not null default 'queued' check (status in ('queued', 'sent', 'failed')),
    error      text,
    created_at timestamptz not null default now(),
    sent_at    timestamptz,
    read_at    timestamptz
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table whatsapp_messages (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid        not null references users (id) on delete cascade,
    to_phone      text        not null,
    template      text        not null,
    params        jsonb       not null default '{}'::jsonb,
    provider_id   text,
    status        text        not null default 'queued'
                  check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
    error         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index whatsapp_messages_user_idx on whatsapp_messages (user_id, created_at desc);
create unique index whatsapp_messages_provider_key on whatsapp_messages (provider_id) where provider_id is not null;

-- Données synchronisées : réglages

create table user_settings (
    id               uuid primary key,
    user_id          uuid        not null references users (id) on delete cascade,
    version          bigint      not null,
    created_at       timestamptz not null,
    updated_at       timestamptz not null,
    deleted_at       timestamptz,
    focus_mode       boolean     not null default false,
    whatsapp_opt_in  boolean     not null default false,
    language         text        not null default 'fr',
    quiet_start      text,
    quiet_end        text,
    daily_brief_at   text
);
create index user_settings_sync_idx on user_settings (user_id, version);

-- Temps

create table tasks (
    id                uuid primary key,
    user_id           uuid        not null references users (id) on delete cascade,
    version           bigint      not null,
    created_at        timestamptz not null,
    updated_at        timestamptz not null,
    deleted_at        timestamptz,
    title             text        not null,
    notes             text,
    kind              text        not null default 'task'
                      check (kind in ('task', 'routine', 'focus', 'break', 'event')),
    day               date        not null,
    start_time        text,
    end_time          text,
    duration_min      integer,
    priority          smallint    not null default 1 check (priority between 0 and 2),
    status            text        not null default 'todo'
                      check (status in ('todo', 'doing', 'done', 'skipped')),
    position          integer     not null default 0,
    recurrence        text,
    goal_id           uuid,
    remind_before_min integer
);
create index tasks_sync_idx on tasks (user_id, version);
create index tasks_day_idx on tasks (user_id, day) where deleted_at is null;

create table reminders (
    id                 uuid primary key,
    user_id            uuid        not null references users (id) on delete cascade,
    version            bigint      not null,
    created_at         timestamptz not null,
    updated_at         timestamptz not null,
    deleted_at         timestamptz,
    target_type        text        not null
                       check (target_type in ('task', 'goal', 'habit', 'contact', 'budget', 'custom')),
    target_id          uuid,
    label              text        not null,
    fire_at            timestamptz not null,
    status             text        not null default 'scheduled'
                       check (status in ('scheduled', 'fired', 'dismissed', 'snoozed')),
    via_whatsapp       boolean     not null default false,
    whatsapp_sent_at   timestamptz
);
create index reminders_sync_idx on reminders (user_id, version);
create index reminders_whatsapp_due_idx on reminders (fire_at)
    where via_whatsapp and whatsapp_sent_at is null and deleted_at is null and status = 'scheduled';

-- Direction

create table goals (
    id              uuid primary key,
    user_id         uuid        not null references users (id) on delete cascade,
    version         bigint      not null,
    created_at      timestamptz not null,
    updated_at      timestamptz not null,
    deleted_at      timestamptz,
    title           text        not null,
    status          text        not null default 'todo' check (status in ('todo', 'doing', 'done')),
    due_date        date,
    notes           text,
    progress_manual smallint    check (progress_manual between 0 and 100)
);
create index goals_sync_idx on goals (user_id, version);

create table goal_steps (
    id         uuid primary key,
    user_id    uuid        not null references users (id) on delete cascade,
    version    bigint      not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz,
    goal_id    uuid        not null,
    title      text        not null,
    done       boolean     not null default false,
    position   integer     not null default 0
);
create index goal_steps_sync_idx on goal_steps (user_id, version);
create index goal_steps_goal_idx on goal_steps (goal_id) where deleted_at is null;

-- Habitudes

create table habits (
    id                uuid primary key,
    user_id           uuid        not null references users (id) on delete cascade,
    version           bigint      not null,
    created_at        timestamptz not null,
    updated_at        timestamptz not null,
    deleted_at        timestamptz,
    title             text        not null,
    cadence           text        not null default 'daily' check (cadence in ('daily', 'weekly')),
    target_per_period integer     not null default 1 check (target_per_period > 0),
    remind_at         text,
    goal_id           uuid,
    archived          boolean     not null default false
);
create index habits_sync_idx on habits (user_id, version);

create table habit_logs (
    id         uuid primary key,
    user_id    uuid        not null references users (id) on delete cascade,
    version    bigint      not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz,
    habit_id   uuid        not null,
    day        date        not null,
    count      integer     not null default 1 check (count >= 0)
);
create index habit_logs_sync_idx on habit_logs (user_id, version);
create index habit_logs_habit_idx on habit_logs (habit_id, day) where deleted_at is null;

-- Argent (montants en FCFA, entiers)

create table accounts (
    id           uuid primary key,
    user_id      uuid        not null references users (id) on delete cascade,
    version      bigint      not null,
    created_at   timestamptz not null,
    updated_at   timestamptz not null,
    deleted_at   timestamptz,
    label        text        not null,
    kind         text        not null check (kind in ('wallet', 'debt', 'credit')),
    provider     text,
    amount_xof   bigint      not null default 0,
    counterparty text,
    due_date     date,
    note         text
);
create index accounts_sync_idx on accounts (user_id, version);

create table transactions (
    id         uuid primary key,
    user_id    uuid        not null references users (id) on delete cascade,
    version    bigint      not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz,
    account_id uuid,
    day        date        not null,
    label      text        not null,
    amount_xof bigint      not null,
    category   text        not null default 'autres'
               check (category in ('alimentation', 'transport', 'logement', 'sante', 'etudes', 'travail',
                                   'loisirs', 'famille', 'abonnements', 'revenus', 'autres')),
    note       text
);
create index transactions_sync_idx on transactions (user_id, version);
create index transactions_day_idx on transactions (user_id, day desc) where deleted_at is null;

create table budgets (
    id            uuid primary key,
    user_id       uuid        not null references users (id) on delete cascade,
    version       bigint      not null,
    created_at    timestamptz not null,
    updated_at    timestamptz not null,
    deleted_at    timestamptz,
    month         text        not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    category      text,
    limit_xof     bigint      not null check (limit_xof > 0),
    alerted_level smallint    not null default 0 check (alerted_level in (0, 80, 100))
);
create index budgets_sync_idx on budgets (user_id, version);

-- Énergie

create table energy_logs (
    id         uuid primary key,
    user_id    uuid        not null references users (id) on delete cascade,
    version    bigint      not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz,
    day        date        not null,
    metric     text        not null,
    label      text        not null,
    value      numeric(10, 2),
    value_text text,
    target     numeric(10, 2),
    unit       text
);
create index energy_logs_sync_idx on energy_logs (user_id, version);
create index energy_logs_day_idx on energy_logs (user_id, day) where deleted_at is null;

-- Réseau

create table contacts (
    id              uuid primary key,
    user_id         uuid        not null references users (id) on delete cascade,
    version         bigint      not null,
    created_at      timestamptz not null,
    updated_at      timestamptz not null,
    deleted_at      timestamptz,
    name            text        not null,
    relation        text        not null default 'autre'
                    check (relation in ('famille', 'ami', 'mentor', 'collegue', 'client', 'partenaire', 'autre')),
    phone           text,
    note            text,
    frequency_kind  text        not null default 'none'
                    check (frequency_kind in ('none', 'weekly', 'biweekly', 'monthly')),
    frequency_day   smallint,
    frequency_time  text,
    last_contact_at timestamptz,
    next_contact_at timestamptz
);
create index contacts_sync_idx on contacts (user_id, version);

create table contact_interactions (
    id         uuid primary key,
    user_id    uuid        not null references users (id) on delete cascade,
    version    bigint      not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz,
    contact_id uuid        not null,
    at         timestamptz not null,
    channel    text        not null default 'call' check (channel in ('call', 'whatsapp', 'meeting', 'other')),
    note       text
);
create index contact_interactions_sync_idx on contact_interactions (user_id, version);
create index contact_interactions_contact_idx on contact_interactions (contact_id, at desc) where deleted_at is null;

-- Compétences

create table skills (
    id                 uuid primary key,
    user_id            uuid        not null references users (id) on delete cascade,
    version            bigint      not null,
    created_at         timestamptz not null,
    updated_at         timestamptz not null,
    deleted_at         timestamptz,
    name               text        not null,
    level              smallint    not null default 0 check (level between 0 and 100),
    monthly_target_xof bigint,
    note               text
);
create index skills_sync_idx on skills (user_id, version);

-- Notes et bilans

create table notes (
    id          uuid primary key,
    user_id     uuid        not null references users (id) on delete cascade,
    version     bigint      not null,
    created_at  timestamptz not null,
    updated_at  timestamptz not null,
    deleted_at  timestamptz,
    title       text        not null default '',
    body        text        not null default '',
    target_type text,
    target_id   uuid
);
create index notes_sync_idx on notes (user_id, version);

create table weekly_reviews (
    id         uuid primary key,
    user_id    uuid        not null references users (id) on delete cascade,
    version    bigint      not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz,
    week_start date        not null,
    payload    jsonb       not null default '{}'::jsonb
);
create index weekly_reviews_sync_idx on weekly_reviews (user_id, version);
