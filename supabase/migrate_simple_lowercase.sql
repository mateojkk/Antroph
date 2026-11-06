-- Simple lowercase normalization for existing users.
-- Run this in the Supabase SQL Editor.
--
-- If this fails with a unique-constraint violation, you have duplicate
-- email/username rows from earlier re-onboarding attempts. In that case,
-- run the cleanup in migrate_normalize_addresses.sql first, or manually
-- merge/delete the duplicates.

begin;

update users
set email = lower(email),
    username = lower(username);

update leaderboard
set username = lower(username);

update leaderboard l
set username = u.username,
    display_name = u.display_name,
    avatar_url = u.avatar_url
from users u
where l.user_id = u.id;

commit;
