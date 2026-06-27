-- Tabitomo — LINE bot / Travel Agent supporting tables
-- Safe to run multiple times (idempotent via IF NOT EXISTS).

-- 1. AI itinerary suggestion session state (LINE bot, 15-min TTL)
create table if not exists suggest_sessions (
  group_id     text        not null,
  user_id      text        not null,
  session_json jsonb       not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- 2. Personalization preferences (recommendation ranking signal)
create table if not exists travel_preferences (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  destination text        not null,
  tags        text[]      not null default '{}',
  budget      text        not null default 'moderate',  -- 'budget' | 'moderate' | 'luxury'
  created_at  timestamptz not null default now()
);
create index if not exists travel_preferences_user_idx on travel_preferences (user_id);

-- 3. Overpass/OSM place candidate cache per destination (7-day TTL)
create table if not exists place_cache (
  destination text        primary key,
  data        jsonb       not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- 4. Rolling buffer of recent LINE group messages (~45-min) for
--    context-aware recommendations
create table if not exists chat_messages (
  id         bigserial   primary key,
  group_id   text        not null,
  user_id    text        not null,
  text       text        not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_group_idx on chat_messages (group_id, created_at desc);

-- 5. LINE bot language per group/user (日本語 / 繁體中文)
create table if not exists bot_locale (
  key        text        primary key,   -- groupId or userId
  locale     text        not null default 'ja',  -- 'ja' | 'zh'
  updated_at timestamptz not null default now()
);
