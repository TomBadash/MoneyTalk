# Running MoneyTalk as a Real, Secure Website

This document explains how to take MoneyTalk from the current local demo (data in the
browser's `localStorage`) to a real, secure, multi-device website with cloud data,
login, and per-user privacy.

> **Bottom line:** the stack the PRD already chose — **Next.js on Vercel + Supabase
> (Postgres + Auth + Row Level Security)** — is a genuinely secure, low-cost way to run
> a personal-finance app. Security comes from four layers working together: TLS in
> transit, authenticated sessions, **Row Level Security** in the database, and proper
> secret handling.

---

## 1. Target architecture

```
   Browser (HTTPS)
        │
        ▼
   Vercel  ──────────────►  Next.js app (SSR + static)
   (CDN, TLS, env vars)         │
                                │  @supabase/ssr (secure cookies)
                                ▼
                            Supabase
                    ┌───────────┬───────────┐
                    │   Auth    │ Postgres  │
                    │ (Google,  │  + RLS    │
                    │  email)   │ per-user  │
                    └───────────┴───────────┘
```

- **Vercel** hosts the Next.js app: automatic HTTPS/TLS certificates, global CDN,
  per-branch preview deploys, and encrypted environment variables.
- **Supabase** provides the Postgres database, authentication, and — critically —
  **Row Level Security**, which enforces that each user can only read/write their own
  rows *at the database level*, even if the client is compromised.

---

## 2. Why this is "secure" (the four layers)

| Layer | Threat it stops | How |
|---|---|---|
| **TLS / HTTPS** | Eavesdropping, tampering in transit | Automatic on Vercel; enforce with HSTS header |
| **Authentication** | Unauthorized users | Supabase Auth, httpOnly secure cookies via `@supabase/ssr` |
| **Row Level Security** | User A reading User B's data; a stolen anon key | DB policies: `auth.uid() = user_id` on every table |
| **Secret hygiene** | Leaked admin credentials | Service-role key stays server-only; never shipped to the browser |

The most important and most misunderstood layer is **RLS**. Get it right and the app is
safe even though the "anon" API key is publicly visible in the browser.

---

## 3. Authentication (Supabase Auth)

- Use **`@supabase/ssr`** (the App-Router-compatible client). It stores the session in
  **httpOnly, Secure, SameSite cookies**, not in `localStorage` — so tokens aren't
  readable by JavaScript/XSS.
- Recommended sign-in methods (PRD §19.1): **Google OAuth** + **email** (magic link or
  password).
- Add a **middleware** (`middleware.ts`) that refreshes the session on each request and
  redirects unauthenticated users away from protected routes.
- In OAuth setup, register the exact **redirect URLs** for both local
  (`http://localhost:3000/...`) and the production Vercel domain.

---

## 4. Data security — Row Level Security (the core)

Every table (`expenses`, `fixed_expenses`, `budgets`, `goals`, `net_worth_entries`) must:

1. Have a `user_id uuid references auth.users` column.
2. Have **RLS enabled**.
3. Have policies tying every row to the logged-in user.

```sql
alter table expenses enable row level security;

create policy "own rows - select" on expenses
  for select using (auth.uid() = user_id);
create policy "own rows - insert" on expenses
  for insert with check (auth.uid() = user_id);
create policy "own rows - update" on expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows - delete" on expenses
  for delete using (auth.uid() = user_id);
```

> **Why the public anon key is safe:** with RLS on, the anon/"publishable" key can only
> ever return rows that pass the policies for the *currently authenticated* user. Without
> a valid session, it returns nothing. RLS — not key secrecy — is what protects the data.

**Never** disable RLS to "make it work", and never use the **service-role key** in the
browser (it bypasses RLS).

---

## 5. Secrets & environment variables

| Variable | Where | Secret? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | No | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `…_ANON_KEY`) | client + server | No — protected by RLS | Browser/session access |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | **YES** | `/api/v1/expense` (API keys), the cron job, account deletion. Every query made with it is re-scoped to one user in `SupabaseRepo`. |
| `APP_ENCRYPTION_KEY` | **server only** | **YES** | AES-256-GCM key for provider tokens at rest. `openssl rand -base64 32`. Required in production. |
| `CRON_SECRET` | **server only** | **YES** | Bearer secret for `/api/cron/daily` (Vercel Cron sends it automatically). |
| `ANTHROPIC_API_KEY` | **server only** | **YES** | Optional. Enables AI category suggestions for unknown merchants and natural-language → query translation. Without it every feature still works deterministically. |
| `MONEYTALK_AI_MODEL` | server | No | Optional model override (default `claude-opus-5-5`). |
| `MONEYTALK_DEV_API_KEY` | server | dev only | Local (no-Supabase) mode: a key accepted by `/api/v1/expense`. |

- Local: put these in **`.env.local`** (gitignored). Without the Supabase variables the app runs in a
  local in-memory demo mode (nothing is persisted).
- Production: set them in the **Vercel dashboard → Project → Settings → Environment Variables**.
- Never prefix a secret with `NEXT_PUBLIC_`. If a secret leaks, rotate it immediately.

---

## 6. Transport & HTTP security headers

HTTPS is automatic on Vercel. Strengthen it with response headers in `next.config.ts`:

```ts
// next.config.ts
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },              // anti-clickjacking
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export default {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```

- **HSTS** forces browsers to always use HTTPS.
- A **Content-Security-Policy (CSP)** is the strongest XSS defense but must be tuned for
  Next.js (it injects some inline/hydration scripts) — add it carefully, test in
  report-only mode first.

---

## 7. Application hardening

- **Validate all input** with **zod** on both the client and any server actions/route
  handlers — never trust the browser. Enforce the real rules in the DB via RLS + column
  constraints.
- **SQL injection**: the Supabase client parameterizes queries; don't build raw SQL from
  user input.
- **CSRF**: cookie-based Supabase auth uses `SameSite` cookies; Next.js Server Actions
  have built-in origin checks (`/api/v1` uses Bearer keys, not cookies, so it is not CSRF-exposed). Keep both.
- **Rate limiting** on auth-sensitive paths (login, signup) — Supabase has some built in;
  add Vercel/Upstash rate limiting for extra protection against brute force.
- **Dependencies**: run `npm audit` periodically and keep Next/Supabase patched.
- **No secrets in client logs**; strip console noise in production.

---

## 8. Privacy notes (this is financial data)

- Personal financial data deserves extra care: keep data minimal, encrypted in transit
  (TLS) and at rest (Supabase encrypts at rest), and isolated per user (RLS).
- **Choose a Supabase region** close to the users (e.g. EU/Frankfurt for Israel) for
  latency and data-residency considerations.
- Consider **2FA** and email verification once the app has real users.
- Have a backup/export story (Supabase provides automated backups on paid tiers).

---

## 9. Step-by-step go-live

1. **Supabase project** — create it; pick a region (EU is a good default for Israel).
2. **Schema + RLS** — apply the migrations in `supabase/migrations/` in order
   (`0001`…`0005`; use the Supabase CLI `supabase db push`, or paste them into the SQL editor).
   `0004_seed_taxonomy.sql` is generated: `npm run gen:taxonomy` after changing `src/classify/taxonomy.ts`.
   `0005` migrates data from the legacy `expenses` / `recurring_expenses` tables (idempotent).
3. **Auth providers** — enable Email; optionally Google OAuth with redirect URIs for localhost + prod.
4. **Env vars** — all of §5 in Vercel (generate `APP_ENCRYPTION_KEY` and `CRON_SECRET`).
5. **Import to Vercel** — connect the repo and deploy. `vercel.json` schedules `/api/cron/daily` at 03:00 UTC.
6. **Auth redirect URLs** — add the production URL in Supabase → Auth → URL configuration.
7. **Security smoke test** — sign in as two users: each must see only their own data. Hit
   `/api/cron/daily` without the secret (expect 401).
8. **Optional** — create an API key in Settings and test `POST /api/v1/expense`.

**Real Open Banking:** implement `FinancialDataProvider` (`src/providers/types.ts`) for your aggregator,
register it in `src/providers/registry.ts`, and nothing else changes. The mock provider shows the full
consent → import → reconcile flow.

---

## 10. Cost

- **Supabase Free** and **Vercel Hobby** tiers comfortably cover a personal app
  (note: Vercel Hobby is for non-commercial use; upgrade to Pro for commercial).
- Upgrade later for backups, more usage, and a commercial license.

---

## 11. Status

Phase 1 is implemented: Supabase auth + RLS, durable transaction model with immutable raw imports,
classification with learning, product memory, budgets/safe-to-spend/forecast, recurring detection,
analytics, monthly report, AI assistant, daily job, REST + API-key endpoints, CSV import.
Phase 1.5 has the connector architecture and a mock provider (no real aggregator yet). Phase 2
(investments, net worth) has schema only. See README.md for what is and isn't verified.

---

## Quick security checklist

- [ ] RLS **enabled** on every table, policies use `auth.uid() = user_id`
- [ ] Service-role key **never** in client / `NEXT_PUBLIC_` / git
- [ ] `.env.local` gitignored; prod secrets only in Vercel
- [ ] `@supabase/ssr` cookie sessions (not `localStorage` tokens)
- [ ] Middleware protects authenticated routes
- [ ] Security headers (HSTS, nosniff, frame-options, referrer, permissions)
- [ ] zod validation on all inputs
- [ ] HTTPS enforced (automatic on Vercel)
- [ ] Two-user RLS smoke test passed
- [ ] `npm audit` clean; deps patched
