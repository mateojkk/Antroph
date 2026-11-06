-- Vela migration: normalize wallet addresses to lowercase
--
-- Sui addresses are case-insensitive, but Postgres `text` comparisons are not.
-- This migration:
--   1. Deduplicates users created with mixed-case wallet addresses.
--   2. Lowercases all remaining emails/usernames.
--   3. Recalculates leaderboard accuracy and re-syncs display fields.
--
-- Run this in the Supabase SQL Editor. Wrap in a transaction so it rolls back
-- on any error.

begin;

-- ----------------------------------------------------------------------------
-- 1. Deduplicate users by lower(email)
--    Keep the oldest row for each lowercased email, reassign children, merge
--    leaderboard stats, then delete the duplicates.
-- ----------------------------------------------------------------------------
with keeper as (
  select distinct on (lower(email))
    id as keep_id,
    lower(email) as norm_email
  from users
  order by lower(email), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.email) = k.norm_email and u.id != k.keep_id
)
update predictions
set user_id = d.keep_id
from dups d
where predictions.user_id = d.dup_id;

with keeper as (
  select distinct on (lower(email))
    id as keep_id,
    lower(email) as norm_email
  from users
  order by lower(email), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.email) = k.norm_email and u.id != k.keep_id
)
update chat_sessions
set user_id = d.keep_id
from dups d
where chat_sessions.user_id = d.dup_id;

-- Add dup's prediction stats to the keeper's leaderboard row (if both have one).
with keeper as (
  select distinct on (lower(email))
    id as keep_id,
    lower(email) as norm_email
  from users
  order by lower(email), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.email) = k.norm_email and u.id != k.keep_id
)
update leaderboard klb
set total_predictions = klb.total_predictions + coalesce(dlb.total_predictions, 0),
    correct = klb.correct + coalesce(dlb.correct, 0)
from leaderboard dlb
join dups d on dlb.user_id = d.dup_id
where klb.user_id = d.keep_id;

-- If the keeper has no leaderboard row, move the dup's row over.
with keeper as (
  select distinct on (lower(email))
    id as keep_id,
    lower(email) as norm_email
  from users
  order by lower(email), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.email) = k.norm_email and u.id != k.keep_id
),
dup_lb as (
  select d.dup_id, d.keep_id
  from leaderboard lb
  join dups d on lb.user_id = d.dup_id
  where not exists (select 1 from leaderboard keeper_lb where keeper_lb.user_id = d.keep_id)
)
update leaderboard lb
set user_id = dup_lb.keep_id
from dup_lb
where lb.user_id = dup_lb.dup_id;

with keeper as (
  select distinct on (lower(email))
    id as keep_id,
    lower(email) as norm_email
  from users
  order by lower(email), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.email) = k.norm_email and u.id != k.keep_id
)
delete from users
where id in (select dup_id from dups);

-- ----------------------------------------------------------------------------
-- 2. Deduplicate users by lower(username) using the same pattern.
-- ----------------------------------------------------------------------------
with keeper as (
  select distinct on (lower(username))
    id as keep_id,
    lower(username) as norm_username
  from users
  order by lower(username), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.username) = k.norm_username and u.id != k.keep_id
)
update predictions
set user_id = d.keep_id
from dups d
where predictions.user_id = d.dup_id;

with keeper as (
  select distinct on (lower(username))
    id as keep_id,
    lower(username) as norm_username
  from users
  order by lower(username), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.username) = k.norm_username and u.id != k.keep_id
)
update chat_sessions
set user_id = d.keep_id
from dups d
where chat_sessions.user_id = d.dup_id;

with keeper as (
  select distinct on (lower(username))
    id as keep_id,
    lower(username) as norm_username
  from users
  order by lower(username), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.username) = k.norm_username and u.id != k.keep_id
)
update leaderboard klb
set total_predictions = klb.total_predictions + coalesce(dlb.total_predictions, 0),
    correct = klb.correct + coalesce(dlb.correct, 0)
from leaderboard dlb
join dups d on dlb.user_id = d.dup_id
where klb.user_id = d.keep_id;

with keeper as (
  select distinct on (lower(username))
    id as keep_id,
    lower(username) as norm_username
  from users
  order by lower(username), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.username) = k.norm_username and u.id != k.keep_id
),
dup_lb as (
  select d.dup_id, d.keep_id
  from leaderboard lb
  join dups d on lb.user_id = d.dup_id
  where not exists (select 1 from leaderboard keeper_lb where keeper_lb.user_id = d.keep_id)
)
update leaderboard lb
set user_id = dup_lb.keep_id
from dup_lb
where lb.user_id = dup_lb.dup_id;

with keeper as (
  select distinct on (lower(username))
    id as keep_id,
    lower(username) as norm_username
  from users
  order by lower(username), created_at asc
),
dups as (
  select u.id as dup_id, k.keep_id
  from users u
  join keeper k on lower(u.username) = k.norm_username and u.id != k.keep_id
)
delete from users
where id in (select dup_id from dups);

-- ----------------------------------------------------------------------------
-- 3. Lowercase remaining rows.
-- ----------------------------------------------------------------------------
update users
set email = lower(email),
    username = lower(username);

-- ----------------------------------------------------------------------------
-- 4. Recalculate leaderboard accuracy and sync display fields.
-- ----------------------------------------------------------------------------
update leaderboard
set accuracy_pct = case
  when total_predictions > 0 then round((correct::numeric / total_predictions) * 100, 1)
  else 0
end;

update leaderboard l
set username = u.username,
    display_name = u.display_name,
    avatar_url = u.avatar_url
from users u
where l.user_id = u.id;

commit;
