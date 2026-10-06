# MoneyTalk — a personal-finance "operating system" (Hebrew, RTL)

Open it for ten seconds and know: how much you spent, how much is left this month and this week,
whether you're on pace, and what you'll probably save. **Automatic by default, manual only when necessary.**

Next.js 16 (App Router, Turbopack) · React 19 · Supabase (Postgres + Auth + RLS) · Tailwind v4 · TypeScript · Vitest.
> This repo targets a Next.js with breaking changes (`proxy.ts` instead of middleware, async `params`, opt-in
> caching). See `AGENTS.md`; read `node_modules/next/dist/docs/` before changing framework-level code.

## Run it

```bash
npm install
npm run dev            # no env needed: local in-memory demo with ~12 months of Israeli sample data
npm test               # 95 tests: engines, classification, analytics, assistant, jobs, CSV, crypto
npm run lint && npm run typecheck && npm run build
```
With Supabase configured (see `.env.local.example`, `DEPLOYMENT.md`) a user with no data sees the demo dataset
with a banner and the CTAs "חבר חשבון בנק" / "הוסף הוצאה ראשונה"; their first real action switches to real data.

## What's in it

| Area | How it works |
|---|---|
| **Dashboard** | One precomputed snapshot row (`daily_financial_snapshots`), server-rendered incl. the SVG pace chart. No AI on page load. |
| **Quick Add** | `N` or `Ctrl/⌘+K` (or the + button): one focused input, `"סלמון 62"` → saved, categorised, remembered; instant toast with Undo / Edit. |
| **Classification** | seed dictionary (he/en) → **your learned rules** → merchant history → (offline) LLM for the rest. ≥90% auto, 70–89% auto + AI badge, <70% Review Queue. Every correction becomes a merchant/product/description rule and re-labels look-alikes. "Why?" on every transaction. |
| **Money model** | Integer agorot everywhere. Only `expense` counts as consumption; savings, investments, transfers and card statements never do (no double counting). Raw imported fields are immutable (DB trigger). |
| **Safe-to-spend** | income − fixed − savings − investments − known upcoming, spread over the remaining days with weekday/weekend weights learned from history; overspending re-spreads the rest of the month. |
| **Forecast** | month-end spend, savings, savings rate, variance vs target, with a confidence level. |
| **Recurring** | weekly → yearly detection, price-hike / new / disappeared / duplicate / unusual alerts, installments (cash-flow vs purchase basis). |
| **Budgets** | one overall target (auto-derived until you set it) + optional category budgets; monthly recommendations you **approve / modify / ignore** — never applied silently. Savings goals are separate from expenses. |
| **Analytics** | week → year/YTD/custom, vs previous period/month/quarter/year (refused when history doesn't cover it), drill-down category → subcategory → product/merchant → transactions. |
| **Assistant** | Deterministic parser for the common questions; an LLM (optional) only translates a question into a validated `QuerySpec`. All numbers are computed from your transactions, each answer has **הצג תנועות**. |
| **Daily job** | `/api/cron/daily`: sync → reconcile → recurring → AI refine → detect → suggestions → snapshot → notifications. Incremental, each step isolated. |
| **Integrations** | `FinancialDataProvider` interface (+ mock), CSV import, `POST /api/v1/expense` (Bearer key, stored hashed), REST wrappers under `/api/*`. |
| **Privacy** | RLS on every table, encrypted provider tokens (AES-GCM), read-only connections enforced by a DB constraint, audit log, export / delete data / delete connection / delete account. AI calls send only merchant text + amount rounded to ₪10. |

```
src/domain      types (agorot, ISO dates)         src/classify  taxonomy, dictionary, pipeline, learned rules
src/engine      pure financial calculations       src/services  ingest, dashboard, analytics, assistant, sync…
src/db          Repo interface: Supabase / memory src/ai        provider interface (Anthropic / no-op)
src/providers   bank connectors, CSV              src/jobs      daily job
supabase/migrations  0003 schema · 0004 taxonomy (generated) · 0005 legacy data
```

## `POST /api/v1/expense`

```bash
curl -X POST https://YOUR-APP/api/v1/expense -H "Authorization: Bearer mt_…" \
  -H "Content-Type: application/json" -d '{"description":"סלמון","amount":59}'
# → {"id":"…","description":"סלמון","amount":59,"category":"מזון לבית","subcategory":"דגים","confidence":0.95}
```

## What is and isn't verified (honest status)

Verified here: unit/integration tests (95), lint, typecheck, production build, the migrations applied to a real
Postgres 16 (RLS isolation, immutable raw rows, idempotent imports/recurring, read-only constraint), and the full
end-to-end scenario in a real browser against the production build (dashboard, Quick Add, product memory,
price-rise insight, assistant answer ↔ transaction list).

**Not verified / not built:**
- `SupabaseRepo` has never run against a live Supabase (no network access to one here); it mirrors the tested
  `MemoryRepo` and the SQL it targets was tested directly. Smoke-test it first (DEPLOYMENT.md §9).
- The Anthropic path is typed and unit-tested with fakes but was not exercised with a real API key.
- No real Open Banking aggregator (mock only). **Excel** import is not implemented (CSV is). Receipt parsing, push/email
  notifications and PWA/offline are not built.
- Analytics aggregate in TypeScript over fetched windows (fine for one person's data; the dashboard is cached). SQL rollups are the next optimisation.
- Investments / net worth: schema and a "coming soon" page only (Phase 2).
- Rate limiting is in-memory per instance.
