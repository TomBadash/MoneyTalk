-- MoneyTalk initial schema.
-- Run this in the Supabase dashboard → SQL Editor (or via the Supabase CLI).
-- Every table is per-user and protected by Row Level Security (DEPLOYMENT.md §4):
-- a user can only ever read/write rows where user_id = their own auth.uid().

-- ── expenses ───────────────────────────────────────────────
create table if not exists public.expenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade
                      default auth.uid(),
  title             text not null,
  amount            numeric(12, 2) not null check (amount >= 0),
  category_id       text not null,
  payment_method_id text,
  note              text,
  date              timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists expenses_user_date_idx
  on public.expenses (user_id, date desc);

alter table public.expenses enable row level security;

create policy "expenses: select own"
  on public.expenses for select using (auth.uid() = user_id);
create policy "expenses: insert own"
  on public.expenses for insert with check (auth.uid() = user_id);
create policy "expenses: update own"
  on public.expenses for update using (auth.uid() = user_id)
                                with check (auth.uid() = user_id);
create policy "expenses: delete own"
  on public.expenses for delete using (auth.uid() = user_id);

-- ── budgets (one monthly budget per user) ──────────────────
create table if not exists public.budgets (
  user_id        uuid primary key references auth.users (id) on delete cascade
                   default auth.uid(),
  monthly_amount integer not null default 6000 check (monthly_amount >= 0),
  updated_at     timestamptz not null default now()
);

alter table public.budgets enable row level security;

create policy "budgets: select own"
  on public.budgets for select using (auth.uid() = user_id);
create policy "budgets: insert own"
  on public.budgets for insert with check (auth.uid() = user_id);
create policy "budgets: update own"
  on public.budgets for update using (auth.uid() = user_id)
                               with check (auth.uid() = user_id);
