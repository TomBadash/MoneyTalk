-- MoneyTalk — recurring expenses.
-- Run this in the Supabase dashboard → SQL Editor AFTER 0001_init.sql.
-- A recurring expense is a per-user template that the app auto-posts into
-- `expenses` once per month (client-side, on app open). Like every table here
-- it is protected by Row Level Security: user_id = auth.uid().

-- ── recurring_expenses ─────────────────────────────────────
create table if not exists public.recurring_expenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade
                      default auth.uid(),
  title             text not null,
  amount            numeric(12, 2) not null check (amount >= 0),
  category_id       text not null,
  payment_method_id text,
  note              text,
  -- Which day of the month to post on. Capped at 28 so it never skips a
  -- short month (Feb etc.).
  day_of_month      integer not null default 1 check (day_of_month between 1 and 28),
  -- Active window, stored as the first day of the month. end_month NULL = runs
  -- indefinitely. A period M is posted only when start_month <= M <= end_month.
  start_month       date not null default date_trunc('month', now())::date,
  end_month         date,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists recurring_user_idx
  on public.recurring_expenses (user_id);

alter table public.recurring_expenses enable row level security;

create policy "recurring: select own"
  on public.recurring_expenses for select using (auth.uid() = user_id);
create policy "recurring: insert own"
  on public.recurring_expenses for insert with check (auth.uid() = user_id);
create policy "recurring: update own"
  on public.recurring_expenses for update using (auth.uid() = user_id)
                                          with check (auth.uid() = user_id);
create policy "recurring: delete own"
  on public.recurring_expenses for delete using (auth.uid() = user_id);

-- ── link generated expenses back to their rule ─────────────
-- NULL for one-off expenses. ON DELETE SET NULL so deleting a rule keeps the
-- expenses it already generated (they just become ordinary one-offs).
alter table public.expenses
  add column if not exists recurring_id uuid
    references public.recurring_expenses (id) on delete set null;

create index if not exists expenses_recurring_idx
  on public.expenses (recurring_id);
