-- Move legacy single-table data into the platform schema. Idempotent (external_id = 'legacy:<id>').
-- Ambiguous legacy categories are flagged needs_review so the user confirms them once in the Review Queue.

with map(legacy, sub, review) as (values
  ('food','s_grocery_general',false), ('restaurants','s_restaurant',false), ('home','s_uncategorized',true),
  ('car','s_fuel',false), ('transit','s_public',false), ('health','s_pharmacy',false), ('sport','s_gym',false),
  ('fun','s_cinema',false), ('shopping','s_shopping_other',false), ('flights','s_flights',false),
  ('investments','s_investment',false), ('gifts','s_shopping_other',true), ('education','s_hobbies',true),
  ('other','s_uncategorized',true)
)
insert into public.transactions (
  user_id, external_id, source_provider, transaction_date, merchant_raw, merchant_normalized, description_raw,
  amount_agorot, transaction_type, subcategory_id, category_id, parent_category_id, financial_type, consumption_type,
  recurring_status, payment_method, needs_review, notes, ai_classification_version, ai_reasoning_summary, created_at
)
select e.user_id, 'legacy:' || e.id, 'manual', (e.date at time zone 'Asia/Jerusalem')::date, e.title,
       lower(e.title), e.title, round(e.amount * 100)::bigint, 'debit',
       s.id, c.id, p.id, coalesce(nullif(c.financial_type,''),'expense'), c.consumption_type,
       case when e.recurring_id is not null then 'recurring' else 'none' end,
       e.payment_method_id, m.review, e.note, 'legacy-map-v1', 'הועבר מהמערכת הקודמת',
       e.created_at
from public.expenses e
join map m on m.legacy = e.category_id
join public.categories s on s.id = m.sub
join public.categories c on c.id = s.parent_id
join public.categories p on p.id = c.parent_id
on conflict do nothing;

-- legacy single monthly budget → overall variable target
insert into public.profiles (user_id, variable_target_agorot)
select user_id, monthly_amount::bigint * 100 from public.legacy_budgets
on conflict (user_id) do update set variable_target_agorot = excluded.variable_target_agorot
  where public.profiles.variable_target_agorot is null;

-- legacy recurring rules → recurring_transactions (monthly)
insert into public.recurring_transactions (user_id, merchant_normalized, title, amount_agorot, interval, day_of_month, next_expected, last_seen, active, source, consumption_type)
select r.user_id, lower(r.title), r.title, round(r.amount * 100)::bigint, 'monthly', r.day_of_month,
       case when (date_trunc('month', current_date)::date + (r.day_of_month - 1)) >= current_date
            then (date_trunc('month', current_date)::date + (r.day_of_month - 1))
            else (date_trunc('month', current_date + interval '1 month')::date + (r.day_of_month - 1)) end,
       r.start_month, r.active, 'user', 'fixed'
from public.recurring_expenses r
on conflict (user_id, merchant_normalized, interval) do nothing;
