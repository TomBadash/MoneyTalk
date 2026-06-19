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

| Variable | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | No (safe to expose) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | No — protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** (admin tasks) | **YES — never `NEXT_PUBLIC`, never commit** |

- Local: put these in **`.env.local`** (already gitignored by the Next.js scaffold).
- Production: set them in the **Vercel dashboard → Project → Settings → Environment
  Variables** (encrypted at rest).
- If a secret ever leaks, **rotate it** in Supabase immediately.
- Anything prefixed `NEXT_PUBLIC_` is bundled into the browser — only put non-secrets there.

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
  have built-in origin checks. Keep both.
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
2. **Schema + RLS** — run the SQL migration (tables, `user_id`, RLS policies §4).
3. **Auth providers** — enable Email; configure **Google OAuth** (client id/secret,
   authorized redirect URIs for localhost + the prod domain).
4. **Wire the app** — add `@supabase/ssr`, server/client Supabase helpers, `middleware.ts`,
   and swap the local store for Supabase-backed data access.
5. **Env vars** — `.env.local` for dev; same keys in Vercel for prod.
6. **Push to GitHub** — commit the repo (with `.env.local` gitignored).
7. **Import to Vercel** — connect the GitHub repo, add the env vars, deploy.
8. **Auth redirect URLs** — in Supabase, add the Vercel production URL to allowed
   redirect/site URLs.
9. **Custom domain** (optional) — add it in Vercel; HTTPS is provisioned automatically.
10. **Add security headers** (§6) and test (e.g. securityheaders.com, SSL Labs).
11. **Smoke test** — sign in as two different users and confirm each sees only their own
    data (RLS check).

---

## 10. Cost

- **Supabase Free** and **Vercel Hobby** tiers comfortably cover a personal app
  (note: Vercel Hobby is for non-commercial use; upgrade to Pro for commercial).
- Upgrade later for backups, more usage, and a commercial license.

---

## 11. Where MoneyTalk is today vs. this target

| | Now (demo) | Secure website (target) |
|---|---|---|
| Data | Browser `localStorage` | Supabase Postgres |
| Auth | None | Supabase Auth (Google + email) |
| Multi-device | No | Yes |
| Privacy | Single browser only | Per-user RLS isolation |
| Hosting | `localhost` | Vercel + HTTPS + custom domain |

Moving to the target = implementing **Phase 1 (Supabase)** from the plan. The current
screens, components, formatting, and data-layer shape are built to swap their data source
to Supabase with minimal UI change.

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
