-- Migration: memory public toggle + Wilson score ranking
-- Run this in the Supabase SQL Editor.

alter table users add column if not exists memory_public boolean default false;
alter table users add column if not exists memory_share_key text;

alter table leaderboard add column if not exists rank_score double precision default 0;
create index if not exists idx_leaderboard_rank_score on leaderboard(rank_score desc);
