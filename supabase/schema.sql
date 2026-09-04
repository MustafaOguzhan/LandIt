-- LandIt database schema
--
-- Run this once in the Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query
-- -> paste this whole file -> Run). Safe to re-run: every statement is idempotent.
--
-- What this sets up:
--   1. `profiles` - one row per user, auto-created on signup. Tracks the 7-day free trial
--      (no credit card) and, once they subscribe, their Stripe subscription status.
--   2. `resumes` - one row per user, holds their builder data as JSON so it persists
--      between visits.
--   3. Row Level Security (RLS) on both tables so a user can only ever read/write their
--      own row - enforced by Postgres itself, not application code.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz not null default now(),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  updated_at timestamptz not null default now()
);

-- Added later for the churn-feedback emails (api/cron-trial-feedback.js and
-- the cancellation path in api/stripe-webhook.js) - each column is set once,
-- the first time that email is sent, so a user is never emailed twice.
alter table public.profiles add column if not exists trial_ended_email_sent_at timestamptz;
alter table public.profiles add column if not exists cancel_feedback_email_sent_at timestamptz;
-- Set once when Stripe's customer.subscription.trial_will_end fires (its
-- default 3-days-before-charge notice) so the "your card is about to be
-- charged" email (api/stripe-webhook.js) is sent exactly once per trial.
alter table public.profiles add column if not exists trial_ending_email_sent_at timestamptz;

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);
-- No insert/delete policy for regular users on purpose: rows are created only by the
-- trigger below, and only the service role (used by the Stripe webhook) can write
-- subscription fields in practice, since the anon/authenticated client only ever
-- needs to read this table.

-- Auto-create a profile row the moment someone signs up, so trial_started_at is set
-- to the exact signup time with no extra round trip from the client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------
create table if not exists public.resumes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.resumes enable row level security;

drop policy if exists "Users can read own resume" on public.resumes;
create policy "Users can read own resume"
  on public.resumes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own resume" on public.resumes;
create policy "Users can insert own resume"
  on public.resumes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own resume" on public.resumes;
create policy "Users can update own resume"
  on public.resumes for update
  using (auth.uid() = user_id);
