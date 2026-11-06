-- Vela Schema — run in Supabase SQL Editor

create table if not exists users (
  id          text primary key,
  email       text unique not null,
  username    text unique not null,
  display_name text,
  avatar_url  text,
  memwal_account_id text,
  memory_public boolean not null default false,
  memory_share_key text,
  created_at  timestamptz not null default now()
);

create table if not exists leaderboard (
  user_id           text primary key references users(id) on delete cascade,
  username          text not null,
  display_name      text,
  avatar_url        text,
  accuracy_pct      real not null default 0,
  total_predictions integer not null default 0,
  correct           integer not null default 0,
  rank              integer not null default 999,
  rank_score        double precision not null default 0
);

create table if not exists predictions (
  id            text primary key,
  user_id       text not null references users(id) on delete cascade,
  type          text not null check (type in ('match', 'market')),
  external_id   text not null,
  user_pick     text not null,
  confidence    integer default 5,
  home_team     text,
  away_team     text,
  question      text,
  take          text,
  resolved      boolean not null default false,
  outcome       text check (outcome in ('correct', 'incorrect')),
  created_at    timestamptz not null default now()
);

create table if not exists chat_sessions (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  title      text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id         text primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_predictions_user   on predictions(user_id, created_at desc);
create index if not exists idx_predictions_ur     on predictions(user_id, resolved);
create index if not exists idx_chat_sessions_user on chat_sessions(user_id, updated_at desc);
create index if not exists idx_chat_messages_sess on chat_messages(session_id, created_at);
create index if not exists idx_leaderboard_rank   on leaderboard(rank);

-- Case-insensitive unique constraints so wallet addresses and usernames
-- can't be claimed twice via different casing.
create unique index if not exists idx_users_email_lower    on users(lower(email));
create unique index if not exists idx_users_username_lower on users(lower(username));
