-- MoneyTalk platform schema (Phase 1 in use; Phase 1.5/2 tables present but empty).
-- Money is stored as integer agorot (bigint). Every user-owned table has RLS keyed on user_id.

create extension if not exists pg_trgm;

-- 0001 created a single-row `budgets` table; keep it for migration, new model takes the name.
alter table public.budgets rename to legacy_budgets;

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  monthly_income_agorot bigint not null default 0 check (monthly_income_agorot >= 0),
  monthly_rent_agorot bigint not null default 0 check (monthly_rent_agorot >= 0),
  monthly_savings_target_agorot bigint not null default 0 check (monthly_savings_target_agorot >= 0),
  monthly_investment_target_agorot bigint not null default 0 check (monthly_investment_target_agorot >= 0),
  variable_target_agorot bigint check (variable_target_agorot >= 0),   -- user-set; null = derived
  timezone text not null default 'Asia/Jerusalem',
  locale text not null default 'he-IL',
  currency text not null default 'ILS',
  analytics_basis text not null default 'cashflow' check (analytics_basis in ('cashflow','purchase')),
  onboarded boolean not null default false,
  notification_prefs jsonb not null default '{"budget_80":true,"weekly_pace":true,"price_change":true,"new_recurring":true}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── taxonomy ─────────────────────────
-- user_id null = system taxonomy (seeded in 0004), readable by everyone; users may add their own.
create table public.categories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  parent_id text references public.categories(id) on delete set null,
  level text not null check (level in ('parent','category','subcategory')),
  name_he text not null,
  icon text,
  color text,
  consumption_type text check (consumption_type in ('fixed','variable_essential','lifestyle','one_off')),
  financial_type text not null default 'expense' check (financial_type in ('expense','income','savings','investment','transfer')),
  archived boolean not null default false
);
create index categories_user_idx on public.categories(user_id);

-- ───────────────────────── accounts & connections ─────────────────────────
create table public.financial_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null,                 -- 'mock' | future open-banking provider id
  institution text not null,
  status text not null default 'active' check (status in ('active','needs_reauth','error','revoked')),
  read_only boolean not null default true check (read_only),   -- connections are ALWAYS read-only
  consent_expires_at timestamptz,
  last_successful_sync timestamptz,
  last_attempted_sync timestamptz,
  last_error text,
  token_ciphertext text,                  -- provider tokens: encrypted app-side (AES-GCM); never plaintext, never sent to client
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  connection_id uuid references public.financial_connections(id) on delete set null,
  kind text not null check (kind in ('bank','credit_card','cash','brokerage','pension','provident','education_fund','crypto')),
  institution text not null,
  name text not null,
  currency text not null default 'ILS',
  balance_agorot bigint,
  external_id text,
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);

-- ───────────────────────── merchants & products ─────────────────────────
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,                      -- canonical display name
  normalized text not null,
  default_subcategory_id text references public.categories(id),
  created_at timestamptz not null default now(),
  unique (user_id, normalized)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  canonical_name text not null,
  normalized text not null,
  brand text,
  preferred_subcategory_id text references public.categories(id),
  preferred_category_id text references public.categories(id),
  preferred_parent_id text references public.categories(id),
  purchase_count int not null default 0,
  total_spent_agorot bigint not null default 0,
  min_price_agorot bigint,
  max_price_agorot bigint,
  last_price_agorot bigint,
  first_purchase_date date,
  last_purchase_date date,
  created_at timestamptz not null default now(),
  unique (user_id, normalized)
);
-- average_price = total_spent / purchase_count (derived, never stored)

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  unique (user_id, alias)
);

create table public.product_merchants (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  primary key (product_id, merchant_id)
);

-- ───────────────────────── recurring ─────────────────────────
create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  merchant_normalized text not null,
  title text not null,
  amount_agorot bigint not null,
  interval text not null check (interval in ('weekly','monthly','bimonthly','quarterly','yearly')),
  day_of_month int,
  next_expected date not null,
  last_seen date not null,
  active boolean not null default true,
  amount_variable boolean not null default false,
  source text not null default 'detected' check (source in ('detected','user')),
  category_id text references public.categories(id),
  consumption_type text,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_normalized, interval)
);

-- ───────────────────────── transactions ─────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  external_id text,
  account_id uuid references public.accounts(id) on delete set null,
  source_provider text not null default 'manual',
  transaction_date date not null,
  posting_date date,
  merchant_raw text not null default '',
  merchant_normalized text not null default '',
  merchant_id uuid references public.merchants(id) on delete set null,
  description_raw text not null default '',
  amount_agorot bigint not null check (amount_agorot >= 0),
  currency text not null default 'ILS',
  transaction_type text not null default 'debit' check (transaction_type in ('debit','credit')),
  product_id uuid references public.products(id) on delete set null,
  subcategory_id text references public.categories(id),
  category_id text references public.categories(id),
  parent_category_id text references public.categories(id),
  financial_type text not null default 'expense' check (financial_type in ('expense','income','savings','investment','transfer')),
  consumption_type text check (consumption_type in ('fixed','variable_essential','lifestyle','one_off')),
  recurring_status text not null default 'none' check (recurring_status in ('none','recurring','suspected')),
  recurring_id uuid references public.recurring_transactions(id) on delete set null,
  payment_method text,
  installment_number int,
  installment_total int,
  ai_confidence real check (ai_confidence between 0 and 1),
  ai_classification_version text,
  ai_reasoning_summary text,
  needs_review boolean not null default false,
  user_corrected boolean not null default false,
  notes text,
  dedupe_key text,
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index transactions_external_uq on public.transactions(user_id, source_provider, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), external_id) where external_id is not null;
create unique index transactions_dedupe_uq on public.transactions(user_id, dedupe_key) where dedupe_key is not null and external_id is null;
-- idempotent recurring postings: one transaction per rule per calendar month
create unique index transactions_recurring_month_uq on public.transactions(recurring_id, (transaction_date - (extract(day from transaction_date)::int - 1))) where recurring_id is not null and source_provider = 'recurring';
create index transactions_user_date_idx on public.transactions(user_id, transaction_date desc) where deleted_at is null;
create index transactions_user_cat_date_idx on public.transactions(user_id, category_id, transaction_date) where deleted_at is null;
create index transactions_user_merchant_idx on public.transactions(user_id, merchant_id);
create index transactions_user_product_idx on public.transactions(user_id, product_id);
create index transactions_review_idx on public.transactions(user_id) where needs_review and deleted_at is null;
create index transactions_updated_idx on public.transactions(user_id, updated_at);   -- incremental processing
create index transactions_search_idx on public.transactions using gin ((merchant_normalized || ' ' || description_raw) gin_trgm_ops);

-- Raw imported data is never overwritten: imported rows are immutable in their raw columns.
create function public.guard_raw_columns() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if old.source_provider not in ('manual','api','recurring') and (
       new.external_id is distinct from old.external_id
    or new.merchant_raw is distinct from old.merchant_raw
    or new.description_raw is distinct from old.description_raw
    or new.amount_agorot is distinct from old.amount_agorot
    or new.transaction_date is distinct from old.transaction_date
    or new.source_provider is distinct from old.source_provider
  ) then
    raise exception 'raw imported transaction data is immutable';
  end if;
  return new;
end $$;
create trigger transactions_guard before update on public.transactions
  for each row execute function public.guard_raw_columns();

-- ───────────────────────── learning ─────────────────────────
create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scope text not null check (scope in ('merchant','product','description')),
  key text not null,
  subcategory_id text not null references public.categories(id),
  weight int not null default 1,
  hits int not null default 1,
  source text not null default 'user' check (source in ('user','ai')),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, key)
);

-- ───────────────────────── budgets & goals ─────────────────────────
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id text references public.categories(id),    -- null = overall monthly variable target
  amount_agorot bigint not null check (amount_agorot >= 0),
  updated_at timestamptz not null default now()
);
create unique index budgets_user_cat_uq on public.budgets(user_id, coalesce(category_id, ''));

create table public.budget_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id text references public.categories(id),
  old_amount_agorot bigint,
  new_amount_agorot bigint not null,
  reason text not null check (reason in ('user','suggestion_approved','onboarding')),
  created_at timestamptz not null default now()
);

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'savings' check (kind in ('monthly_saving','emergency_fund','vacation','purchase','investment')),
  target_agorot bigint not null check (target_agorot > 0),
  current_agorot bigint not null default 0,
  monthly_contribution_agorot bigint,
  target_date date,
  created_at timestamptz not null default now()
);

-- ───────────────────────── precomputed dashboard ─────────────────────────
create table public.daily_financial_snapshots (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot_date date not null,
  payload jsonb not null,                    -- the whole dashboard, ready to render
  computed_through timestamptz not null default now(),
  primary key (user_id, snapshot_date)
);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('budget','category_rule','recurring')),
  category_id text references public.categories(id),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','modified','ignored')),
  period text,                               -- e.g. '2026-10'
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index ai_suggestions_pending_uq on public.ai_suggestions(user_id, kind, coalesce(category_id,''), period);

-- ───────────────────────── ops ─────────────────────────
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  connection_id uuid references public.financial_connections(id) on delete set null,
  kind text not null default 'daily',
  status text not null default 'running' check (status in ('running','ok','partial','error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb,
  error text
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table public.receipt_imports (        -- schema only (receipt parsing is post-MVP)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  storage_path text,
  status text not null default 'pending' check (status in ('pending','parsed','failed')),
  parsed jsonb,                              -- merchant, date, items[{name,qty,price,discount}], total
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null,
  target text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'default',
  key_hash text not null unique,             -- sha-256 of the key; the key itself is shown once
  prefix text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Phase 2: investments (schema only) ─────────────────────────
create table public.investment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('brokerage','pension','provident','education_fund','cash','crypto')),
  institution text, name text not null, currency text not null default 'ILS',
  created_at timestamptz not null default now()
);
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text, name text not null,
  asset_type text not null check (asset_type in ('etf','stock','bond','mutual_fund','cash','crypto','other')),
  allocation_class text not null default 'other' check (allocation_class in ('us_equity','intl_equity','il_equity','bonds','cash','other')),
  currency text not null default 'USD'
);
create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  quantity numeric(24,8) not null, average_cost numeric(24,8), current_price numeric(24,8),
  market_value_agorot bigint, updated_at timestamptz not null default now()
);
create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  asset_id uuid references public.assets(id),
  kind text not null check (kind in ('buy','sell','dividend','deposit','withdrawal','fee')),
  quantity numeric(24,8), price numeric(24,8), amount_agorot bigint not null, trade_date date not null,
  source_transaction_id uuid references public.transactions(id) on delete set null
);
create table public.portfolio_snapshots (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot_date date not null, payload jsonb not null,
  primary key (user_id, snapshot_date)
);
create table public.net_worth_snapshots (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot_date date not null,
  cash_agorot bigint not null default 0, investments_agorot bigint not null default 0, debt_agorot bigint not null default 0,
  contributions_agorot bigint not null default 0, gains_agorot bigint not null default 0,
  primary key (user_id, snapshot_date)
);

-- ───────────────────────── Row Level Security ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','financial_connections','accounts','merchants','products','product_aliases','product_merchants',
    'recurring_transactions','transactions','categorization_rules','budgets','budget_history','financial_goals',
    'daily_financial_snapshots','ai_suggestions','sync_jobs','notifications','receipt_imports','api_keys',
    'investment_accounts','assets','holdings','investment_transactions','portfolio_snapshots','net_worth_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select" on public.%1$I for select using (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- categories: system rows (user_id null) readable by any signed-in user; custom rows owner-only
alter table public.categories enable row level security;
create policy categories_select on public.categories for select using (user_id is null or auth.uid() = user_id);
create policy categories_insert on public.categories for insert with check (auth.uid() = user_id);
create policy categories_update on public.categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy categories_delete on public.categories for delete using (auth.uid() = user_id);

-- audit log: users may append and read their own entries, never edit/delete
alter table public.audit_logs enable row level security;
create policy audit_select on public.audit_logs for select using (auth.uid() = user_id);
create policy audit_insert on public.audit_logs for insert with check (auth.uid() = user_id);

-- legacy budgets table from 0001 lacked a delete policy
create policy legacy_budgets_delete on public.legacy_budgets for delete using (auth.uid() = user_id);
