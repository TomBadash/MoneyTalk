"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { getProvider } from "@/providers/registry";
import { decryptSecret, encryptSecret, newApiKey } from "@/lib/crypto";
import { syncConnection, reconcileRecent, importProviderTxns } from "@/services/sync";
import { refreshSnapshot } from "@/services/refresh";
import { runDaily } from "@/jobs/daily";
import { getAiProvider } from "@/ai";
import { csvToTransactions } from "@/providers/csv";
import { parseMoney } from "@/lib/money-input";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { DEFAULT_PREFS } from "@/engine/notifications";

const STATE_COOKIE = "mt_connect_state";
const refresh = async () => { const c = await getContext(); await refreshSnapshot(c.write, c.today).catch(() => undefined); revalidatePath("/", "layout"); };

/** Step 1: ask the provider for its hosted, read-only consent page. We never see bank credentials. */
export async function beginConnectAction(form: FormData): Promise<void> {
  const id = z.string().max(30).parse(form.get("provider"));
  const p = getProvider(id);
  if (!p) redirect("/accounts?error=provider");
  const ctx = await getContext();
  const r = await p.beginConnect({ userId: ctx.userId ?? "local", returnUrl: "/accounts" });
  (await cookies()).set(STATE_COOKIE, `${id}:${r.state}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  await ctx.write.audit("connection.begin", id);
  redirect(r.redirectUrl);
}

/** Step 2: provider redirects back with consent. Verify state, store the token ENCRYPTED, import, never block on failure. */
export async function completeConnectAction(form: FormData): Promise<void> {
  const state = String(form.get("state") ?? "");
  const jar = await cookies();
  const [providerId, expected] = (jar.get(STATE_COOKIE)?.value ?? "").split(":");
  jar.delete(STATE_COOKIE);
  const p = providerId ? getProvider(providerId) : undefined;
  if (!p || !expected || expected !== state) redirect("/accounts?error=state");
  if (form.get("consent") !== "granted") redirect("/accounts?error=denied");
  const ctx = await getContext();
  let ok = true;
  try {
    const done = await p.completeConnect({ state, params: { consent: "granted" } });
    const { connection } = await ctx.write.createConnection({
      provider: p.id, institution: done.institution, accounts: done.accounts.map((a) => ({ kind: a.kind, institution: a.institution, name: a.name, balance: a.balance ?? null, externalId: a.externalId })),
      tokenCiphertext: encryptSecret(done.handle.token), consentExpiresAt: done.handle.expiresAt ?? null,
    });
    await ctx.write.audit("connection.created", connection.id, { provider: p.id });
    await syncConnection(ctx.write, connection.id, p, decryptSecret, ctx.today);
    await reconcileRecent(ctx.write, ctx.today);
    await runDaily(ctx.write, ctx.today, { ai: getAiProvider(), provider: getProvider, decrypt: decryptSecret });
  } catch { ok = false; }
  await refresh();
  redirect(ok ? "/accounts?connected=1" : "/accounts?error=connect");
}

export async function disconnectAction(form: FormData): Promise<void> {
  const id = z.string().uuid().parse(form.get("id"));
  const ctx = await getContext();
  const conn = (await ctx.write.connections()).find((c) => c.id === id);
  const p = conn && getProvider(conn.provider);
  try { const cipher = await ctx.write.connectionToken(id); if (p && cipher) await p.revoke({ token: decryptSecret(cipher) }); } catch { /* revoking remotely is best effort */ }
  await ctx.write.deleteConnection(id);
  await ctx.write.audit("connection.deleted", id);
  await refresh();
  redirect("/accounts?disconnected=1");
}

export async function syncNowAction(): Promise<void> {
  const ctx = await getContext();
  if (rateLimit(`sync:${ctx.userId ?? "local"}`, 6)) await runDaily(ctx.write, ctx.today, { ai: getAiProvider(), provider: getProvider, decrypt: decryptSecret });
  await refresh();
  redirect("/accounts?synced=1");
}

export async function importCsvAction(form: FormData): Promise<void> {
  const file = form.get("file");
  const kind = z.enum(["bank", "credit_card"]).parse(form.get("kind") ?? "bank");
  if (!(file instanceof File) || file.size === 0) redirect("/accounts?error=nofile");
  if (file.size > 2_000_000) redirect("/accounts?error=toolarge");
  const ctx = await getContext();
  const ext = `csv-${kind}`;
  const accounts = await ctx.write.accounts();
  const acc = accounts.find((a) => a.externalId === ext) ?? await ctx.write.createAccount({ kind, institution: "ייבוא קובץ", name: kind === "bank" ? "עו״ש (CSV)" : "כרטיס אשראי (CSV)", externalId: ext, balance: null });
  const parsed = csvToTransactions(await file.text(), ext);
  if (parsed.error) redirect(`/accounts?error=csv&msg=${encodeURIComponent(parsed.error)}`);
  const n = await importProviderTxns(ctx.write, parsed.txns, "csv", () => acc.id, ctx.today);
  await reconcileRecent(ctx.write, ctx.today);
  await ctx.write.audit("import.csv", acc.id, { rows: parsed.txns.length, imported: n });
  await refresh();
  redirect(`/accounts?imported=${n}&skipped=${parsed.skipped}`);
}

export async function addCashAction(form: FormData): Promise<void> {
  const balance = parseMoney(form.get("balance") ?? "0") ?? 0;
  const ctx = await getContext();
  await ctx.write.createAccount({ kind: "cash", institution: "מזומן", name: "מזומן", balance, externalId: null });
  revalidatePath("/accounts");
  redirect("/accounts");
}

/* ───────────── settings ───────────── */

export async function saveProfileAction(form: FormData): Promise<void> {
  const ctx = await getContext();
  const m = (k: string) => parseMoney(form.get(k) ?? "0") ?? 0;
  const target = String(form.get("variableTarget") ?? "").trim();
  await ctx.write.saveProfile({
    displayName: String(form.get("displayName") ?? "").trim().slice(0, 40) || null,
    monthlyIncome: m("income"), monthlyRent: m("rent"), monthlySavingsTarget: m("savings"), monthlyInvestmentTarget: m("investments"),
    variableTarget: target ? parseMoney(target) : null,
  });
  await refresh();
  redirect("/settings?saved=1");
}

export async function savePrefsAction(form: FormData): Promise<void> {
  const ctx = await getContext();
  const prefs = Object.fromEntries(Object.keys(DEFAULT_PREFS).map((k) => [k, form.get(k) === "on"])) as typeof DEFAULT_PREFS;
  await ctx.write.saveProfile({ notificationPrefs: prefs });
  redirect("/settings?saved=1");
}

export type KeyState = { key?: string; error?: string } | undefined;
export async function createApiKeyAction(_prev: KeyState, form: FormData): Promise<KeyState> {
  const ctx = await getContext();
  if (ctx.local) return { error: "בהרצה מקומית ללא Supabase אין מפתחות API (השתמש ב-MONEYTALK_DEV_API_KEY)." };
  if (!rateLimit(`key:${ctx.userId}`, 5, 3_600_000)) return { error: "יצרת הרבה מפתחות לאחרונה. נסה שוב מאוחר יותר." };
  const name = String(form.get("name") ?? "default").trim().slice(0, 40) || "default";
  const k = newApiKey();
  await ctx.write.createApiKey(name, k.hash, k.prefix);
  await ctx.write.audit("apikey.created", k.prefix);
  revalidatePath("/settings");
  return { key: k.key }; // shown once, only the hash is stored
}
export async function revokeApiKeyAction(form: FormData): Promise<void> {
  const id = z.string().uuid().parse(form.get("id"));
  const ctx = await getContext();
  await ctx.write.revokeApiKey(id);
  await ctx.write.audit("apikey.revoked", id);
  revalidatePath("/settings");
}

export async function deleteImportedDataAction(form: FormData): Promise<void> {
  if (String(form.get("confirm")).trim() !== "מחק") redirect("/settings?error=confirm");
  const ctx = await getContext();
  await ctx.write.audit("data.delete_transactions");
  await ctx.write.deleteAllTransactions();
  await refresh();
  redirect("/settings?deleted=1");
}

export async function deleteAccountAction(form: FormData): Promise<void> {
  if (String(form.get("confirm")).trim() !== "מחק") redirect("/settings?error=confirm");
  const ctx = await getContext();
  if (ctx.local || !ctx.userId) redirect("/settings?error=local");
  const admin = createServiceClient();
  if (!admin) redirect("/settings?error=service");
  await ctx.write.audit("account.delete");
  const { error } = await admin.auth.admin.deleteUser(ctx.userId); // cascades to every table via ON DELETE CASCADE
  if (error) redirect("/settings?error=delete");
  await (await createClient()).auth.signOut();
  redirect("/login");
}

/* ───────────── onboarding ───────────── */

export async function onboardAction(form: FormData): Promise<void> {
  const ctx = await getContext();
  const m = (k: string) => parseMoney(form.get(k) ?? "0") ?? 0;
  await ctx.write.saveProfile({ monthlyIncome: m("income"), monthlyRent: m("rent"), monthlySavingsTarget: m("savings"), onboarded: true });
  await refresh();
  redirect(form.get("connect") === "1" ? "/accounts" : "/");
}

export async function markNotificationsReadAction(): Promise<void> {
  const ctx = await getContext();
  await ctx.write.markNotificationsRead();
  revalidatePath("/", "layout");
}
