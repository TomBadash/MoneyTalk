import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountRow, ApiKeyRow, Budget, Connection, Goal, NotificationPrefs, SyncJob, IsoDate, MerchantRow, Notification, ProductRow, Profile, RecurringRule, Suggestion, Txn,
} from "@/domain/types";
import type { LearnedRule } from "@/classify/memory";
import type { DashboardPayload } from "@/services/dashboard";
import { dedupeKey } from "@/engine/dedupe";
import type { Repo, TxnFilter } from "./repo";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type ProfileRow = Profile & { onboarded: boolean; displayName?: string | null; notificationPrefs?: NotificationPrefs };

const PAGE = 1000; // PostgREST's default max-rows

const toRow = (t: Txn): Row => {
  const typed = t.sourceProvider === "manual" || t.sourceProvider === "api" || t.sourceProvider === "recurring";
  return {
    id: t.id, external_id: t.externalId ?? null, account_id: t.accountId ?? null, source_provider: t.sourceProvider,
    transaction_date: t.date, posting_date: t.postingDate ?? null,
    merchant_raw: t.merchantRaw, merchant_normalized: t.merchantNormalized, merchant_id: t.merchantId ?? null,
    description_raw: t.descriptionRaw, amount_agorot: t.amount, currency: t.currency, transaction_type: t.transactionType,
    product_id: t.productId ?? null, subcategory_id: t.subcategoryId ?? null, category_id: t.categoryId ?? null,
    parent_category_id: t.parentCategoryId ?? null, financial_type: t.financialType, consumption_type: t.consumptionType ?? null,
    recurring_status: t.recurringStatus, recurring_id: t.recurringId ?? null, payment_method: t.paymentMethod ?? null,
    installment_number: t.installmentNumber ?? null, installment_total: t.installmentTotal ?? null,
    ai_confidence: t.aiConfidence ?? null, ai_classification_version: t.aiClassificationVersion ?? null,
    ai_reasoning_summary: t.aiReasoningSummary ?? null, needs_review: !!t.needsReview, user_corrected: t.userCorrected,
    notes: t.notes ?? null,
    // composite key only for provider rows with no external id (typed entries are intentional duplicates)
    dedupe_key: !typed && !t.externalId ? dedupeKey(t) : null,
  };
};

const fromRow = (r: Row): Txn => ({
  id: r.id, externalId: r.external_id, accountId: r.account_id, sourceProvider: r.source_provider,
  date: r.transaction_date, postingDate: r.posting_date, merchantRaw: r.merchant_raw, merchantNormalized: r.merchant_normalized,
  merchantId: r.merchant_id, descriptionRaw: r.description_raw, amount: Number(r.amount_agorot), currency: r.currency,
  transactionType: r.transaction_type, productId: r.product_id, subcategoryId: r.subcategory_id, categoryId: r.category_id,
  parentCategoryId: r.parent_category_id, financialType: r.financial_type, consumptionType: r.consumption_type,
  recurringStatus: r.recurring_status, recurringId: r.recurring_id, paymentMethod: r.payment_method,
  installmentNumber: r.installment_number, installmentTotal: r.installment_total, aiConfidence: r.ai_confidence,
  aiClassificationVersion: r.ai_classification_version, aiReasoningSummary: r.ai_reasoning_summary,
  needsReview: r.needs_review, userCorrected: r.user_corrected, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
});

const patchToRow = (p: Partial<Txn>): Row => {
  const full = toRow({ ...({} as Txn), ...p } as Txn);
  const map: Record<string, string> = {
    externalId: "external_id", accountId: "account_id", sourceProvider: "source_provider", date: "transaction_date",
    postingDate: "posting_date", merchantRaw: "merchant_raw", merchantNormalized: "merchant_normalized", merchantId: "merchant_id",
    descriptionRaw: "description_raw", amount: "amount_agorot", currency: "currency", transactionType: "transaction_type",
    productId: "product_id", subcategoryId: "subcategory_id", categoryId: "category_id", parentCategoryId: "parent_category_id",
    financialType: "financial_type", consumptionType: "consumption_type", recurringStatus: "recurring_status",
    recurringId: "recurring_id", paymentMethod: "payment_method", installmentNumber: "installment_number",
    installmentTotal: "installment_total", aiConfidence: "ai_confidence", aiClassificationVersion: "ai_classification_version",
    aiReasoningSummary: "ai_reasoning_summary", needsReview: "needs_review", userCorrected: "user_corrected", notes: "notes",
  };
  const out: Row = {};
  for (const k of Object.keys(p)) if (map[k]) out[map[k]] = full[map[k]];
  return out;
};

function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Row-Level-Security-protected repository: every query runs as the signed-in user. */
export class SupabaseRepo implements Repo {
  readonly kind = "supabase" as const;
  constructor(private sb: SupabaseClient, private userId: string) {}

  /**
   * Every query is explicitly scoped to this user *in addition to* RLS. Session clients are
   * protected by RLS; the service-role client used by the API-key endpoint and the daily job
   * bypasses it, so the scope must be enforced here and can never be forgotten per query.
   */
  private from(table: string) {
    const uid = this.userId;
    const b = this.sb.from(table);
    const withUser = (v: unknown) => (Array.isArray(v) ? v.map((r) => ({ ...r, user_id: uid })) : { ...(v as object), user_id: uid });
    return {
      select: (cols?: string, opts?: { count?: "exact"; head?: boolean }) => b.select(cols, opts).eq("user_id", uid),
      update: (v: Row) => b.update(v).eq("user_id", uid),
      delete: () => b.delete().eq("user_id", uid),
      insert: (v: Row | Row[]) => b.insert(withUser(v) as Row),
      upsert: (v: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => b.upsert(withUser(v) as Row, o),
    };
  }

  /* profile */
  async profile(): Promise<ProfileRow> {
    const r = check(await this.from("profiles").select("*").maybeSingle(), "profile") as Row | null;
    return {
      monthlyIncome: Number(r?.monthly_income_agorot ?? 0), monthlyRent: Number(r?.monthly_rent_agorot ?? 0),
      monthlySavingsTarget: Number(r?.monthly_savings_target_agorot ?? 0), monthlyInvestmentTarget: Number(r?.monthly_investment_target_agorot ?? 0),
      variableTarget: r?.variable_target_agorot == null ? null : Number(r.variable_target_agorot),
      onboarded: !!r?.onboarded, displayName: r?.display_name ?? null, notificationPrefs: r?.notification_prefs ?? undefined,
    };
  }
  async saveProfile(p: Partial<ProfileRow>) {
    const row: Row = { user_id: this.userId, updated_at: new Date().toISOString() };
    if (p.monthlyIncome != null) row.monthly_income_agorot = p.monthlyIncome;
    if (p.monthlyRent != null) row.monthly_rent_agorot = p.monthlyRent;
    if (p.monthlySavingsTarget != null) row.monthly_savings_target_agorot = p.monthlySavingsTarget;
    if (p.monthlyInvestmentTarget != null) row.monthly_investment_target_agorot = p.monthlyInvestmentTarget;
    if (p.variableTarget !== undefined) row.variable_target_agorot = p.variableTarget;
    if (p.onboarded != null) row.onboarded = p.onboarded;
    if (p.displayName !== undefined) row.display_name = p.displayName;
    if (p.notificationPrefs) row.notification_prefs = p.notificationPrefs;
    check(await this.from("profiles").upsert(row, { onConflict: "user_id" }), "saveProfile");
  }

  /* transactions */
  async txns(f: TxnFilter = {}): Promise<Txn[]> {
    const out: Txn[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.from("transactions").select("*").is("deleted_at", null)
        .order("transaction_date", { ascending: false }).order("id").range(from, from + PAGE - 1);
      if (f.from) q = q.gte("transaction_date", f.from);
      if (f.to) q = q.lte("transaction_date", f.to);
      if (f.merchantNormalized) q = q.eq("merchant_normalized", f.merchantNormalized);
      if (f.productId) q = q.eq("product_id", f.productId);
      if (f.categoryId) q = q.or(`category_id.eq.${f.categoryId},subcategory_id.eq.${f.categoryId},parent_category_id.eq.${f.categoryId}`);
      if (f.needsReview != null) q = q.eq("needs_review", f.needsReview);
      if (f.updatedAfter) q = q.gt("updated_at", f.updatedAfter);
      const rows = check(await q, "txns") as Row[];
      out.push(...rows.map(fromRow));
      if (rows.length < PAGE || (f.limit && out.length >= f.limit)) break;
    }
    return f.limit ? out.slice(0, f.limit) : out;
  }
  async txn(id: string) {
    const r = check(await this.from("transactions").select("*").eq("id", id).is("deleted_at", null).maybeSingle(), "txn");
    return r ? fromRow(r) : null;
  }
  async countTxns() {
    const res = await this.from("transactions").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (res.error) throw new Error(`countTxns: ${res.error.message}`);
    return res.count ?? 0;
  }
  async insertTxns(ts: Txn[]) {
    if (ts.length === 0) return [];
    const rows = ts.map(toRow);
    const batch = await this.from("transactions").insert(rows).select("*");
    if (!batch.error) return (batch.data as Row[]).map(fromRow);
    if (batch.error.code !== "23505") throw new Error(`insertTxns: ${batch.error.message}`);
    // duplicate(s) inside the batch: keep the new ones, skip what already exists
    const done: Txn[] = [];
    for (const row of rows) {
      const one = await this.from("transactions").insert(row).select("*").single();
      if (one.error) { if (one.error.code === "23505") continue; throw new Error(`insertTxns: ${one.error.message}`); }
      done.push(fromRow(one.data as Row));
    }
    return done;
  }
  async updateTxn(id: string, patch: Partial<Txn>) {
    check(await this.from("transactions").update(patchToRow(patch)).eq("id", id), "updateTxn");
  }
  async softDeleteTxn(id: string) { check(await this.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id), "delete"); }
  async restoreTxn(id: string) { check(await this.from("transactions").update({ deleted_at: null }).eq("id", id), "restore"); }
  async deleteAllTransactions() { check(await this.from("transactions").delete().not("id", "is", null), "deleteAll"); }

  /* learning */
  async rules(): Promise<LearnedRule[]> {
    const rows = check(await this.from("categorization_rules").select("*"), "rules") as Row[];
    return rows.map((r) => ({ scope: r.scope, key: r.key, subcategoryId: r.subcategory_id, weight: r.weight, hits: r.hits, source: r.source }));
  }
  async upsertRules(rs: LearnedRule[]) {
    if (!rs.length) return;
    check(await this.from("categorization_rules").upsert(
      rs.map((r) => ({ user_id: this.userId, scope: r.scope, key: r.key, subcategory_id: r.subcategoryId, weight: r.weight, hits: r.hits, source: r.source, updated_at: new Date().toISOString() })),
      { onConflict: "user_id,scope,key" }), "upsertRules");
  }

  /* products & merchants */
  async products(): Promise<ProductRow[]> {
    const rows = check(await this.from("products").select("*"), "products") as Row[];
    return rows.map((r) => ({ id: r.id, name: r.canonical_name, normalized: r.normalized, brand: r.brand, subcategoryId: r.preferred_subcategory_id, categoryId: r.preferred_category_id, parentCategoryId: r.preferred_parent_id }));
  }
  async upsertProduct(p: Omit<ProductRow, "id">): Promise<ProductRow> {
    const r = check(await this.from("products").upsert(
      { user_id: this.userId, canonical_name: p.name, normalized: p.normalized, brand: p.brand ?? null, preferred_subcategory_id: p.subcategoryId ?? null, preferred_category_id: p.categoryId ?? null, preferred_parent_id: p.parentCategoryId ?? null },
      { onConflict: "user_id,normalized", ignoreDuplicates: false }).select("*").single(), "upsertProduct") as Row;
    return { id: r.id, name: r.canonical_name, normalized: r.normalized, brand: r.brand, subcategoryId: r.preferred_subcategory_id, categoryId: r.preferred_category_id, parentCategoryId: r.preferred_parent_id };
  }
  async merchants(): Promise<MerchantRow[]> {
    const rows = check(await this.from("merchants").select("*"), "merchants") as Row[];
    return rows.map((r) => ({ id: r.id, name: r.name, normalized: r.normalized, defaultSubcategoryId: r.default_subcategory_id }));
  }
  async upsertMerchant(m: Omit<MerchantRow, "id">): Promise<MerchantRow> {
    const r = check(await this.from("merchants").upsert(
      { user_id: this.userId, name: m.name, normalized: m.normalized, default_subcategory_id: m.defaultSubcategoryId ?? null },
      { onConflict: "user_id,normalized" }).select("*").single(), "upsertMerchant") as Row;
    return { id: r.id, name: r.name, normalized: r.normalized, defaultSubcategoryId: r.default_subcategory_id };
  }

  /* recurring */
  async recurring(): Promise<RecurringRule[]> {
    const rows = check(await this.from("recurring_transactions").select("*"), "recurring") as Row[];
    return rows.map((r) => ({ id: r.id, merchantNormalized: r.merchant_normalized, title: r.title, amount: Number(r.amount_agorot), interval: r.interval, dayOfMonth: r.day_of_month, nextExpected: r.next_expected, lastSeen: r.last_seen, active: r.active, categoryId: r.category_id, consumptionType: r.consumption_type, source: r.source, amountVariable: r.amount_variable }));
  }
  async replaceDetectedRecurring(rs: RecurringRule[]) {
    check(await this.from("recurring_transactions").delete().eq("source", "detected"), "clearRecurring");
    if (!rs.length) return;
    check(await this.from("recurring_transactions").insert(rs.map((r) => ({
      user_id: this.userId, merchant_normalized: r.merchantNormalized, title: r.title, amount_agorot: r.amount, interval: r.interval,
      day_of_month: r.dayOfMonth ?? null, next_expected: r.nextExpected, last_seen: r.lastSeen, active: r.active, source: "detected", amount_variable: r.amountVariable ?? false,
      category_id: r.categoryId ?? null, consumption_type: r.consumptionType ?? null,
    }))), "insertRecurring");
  }

  async addUserRecurring(r: Omit<RecurringRule, "id">): Promise<RecurringRule> {
    const row = check(await this.from("recurring_transactions").insert({
      merchant_normalized: r.merchantNormalized, title: r.title, amount_agorot: r.amount, interval: r.interval, day_of_month: r.dayOfMonth ?? null,
      next_expected: r.nextExpected, last_seen: r.lastSeen, active: r.active, source: "user", category_id: r.categoryId ?? null, consumption_type: r.consumptionType ?? null,
    }).select("*").single(), "addUserRecurring") as Row;
    return { ...r, id: row.id, source: "user" };
  }
  async deleteRecurring(id: string) { check(await this.from("recurring_transactions").delete().eq("id", id), "deleteRecurring"); }
  async updateRecurring(id: string, patch: Partial<RecurringRule>) {
    const row: Row = {};
    if (patch.lastSeen) row.last_seen = patch.lastSeen;
    if (patch.nextExpected) row.next_expected = patch.nextExpected;
    if (patch.active != null) row.active = patch.active;
    if (patch.amount != null) row.amount_agorot = patch.amount;
    check(await this.from("recurring_transactions").update(row).eq("id", id), "updateRecurring");
  }

  /* goals */
  async goals(): Promise<Goal[]> {
    const rows = check(await this.from("financial_goals").select("*"), "goals") as Row[];
    return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, target: Number(r.target_agorot), current: Number(r.current_agorot), monthlyContribution: r.monthly_contribution_agorot == null ? null : Number(r.monthly_contribution_agorot), targetDate: r.target_date }));
  }
  async saveGoal(g: Omit<Goal, "id"> & { id?: string }) {
    const row = { name: g.name, kind: g.kind, target_agorot: g.target, current_agorot: g.current, monthly_contribution_agorot: g.monthlyContribution ?? null, target_date: g.targetDate ?? null };
    if (g.id) check(await this.from("financial_goals").update(row).eq("id", g.id), "saveGoal");
    else check(await this.from("financial_goals").insert(row), "saveGoal");
  }
  async deleteGoal(id: string) { check(await this.from("financial_goals").delete().eq("id", id), "deleteGoal"); }

  /* connections & jobs */
  async connections(): Promise<Connection[]> {
    const rows = check(await this.from("financial_connections").select("*"), "connections") as Row[];
    return rows.map((r) => ({ id: r.id, provider: r.provider, institution: r.institution, status: r.status, lastSuccessfulSync: r.last_successful_sync, lastAttemptedSync: r.last_attempted_sync, lastError: r.last_error, consentExpiresAt: r.consent_expires_at }));
  }
  async createAccount(a: Omit<AccountRow, "id">): Promise<AccountRow> {
    const r = check(await this.from("accounts").insert({ connection_id: a.connectionId ?? null, kind: a.kind, institution: a.institution, name: a.name, balance_agorot: a.balance ?? null, external_id: a.externalId ?? null }).select("*").single(), "createAccount") as Row;
    return { id: r.id, kind: r.kind, institution: r.institution, name: r.name, balance: a.balance ?? null, status: "active", externalId: r.external_id, connectionId: r.connection_id };
  }
  async createConnection(c: { provider: string; institution: string; accounts: Omit<AccountRow, "id">[]; tokenCiphertext?: string; consentExpiresAt?: string | null }) {
    const r = check(await this.from("financial_connections").insert({ provider: c.provider, institution: c.institution, status: "active", read_only: true, token_ciphertext: c.tokenCiphertext ?? null, consent_expires_at: c.consentExpiresAt ?? null }).select("id, provider, institution, status, consent_expires_at").single(), "createConnection") as Row;
    const accounts: AccountRow[] = [];
    for (const a of c.accounts) accounts.push(await this.createAccount({ ...a, connectionId: r.id }));
    return { connection: { id: r.id, provider: r.provider, institution: r.institution, status: r.status, consentExpiresAt: r.consent_expires_at } as Connection, accounts };
  }
  async connectionToken(id: string) {
    const r = check(await this.from("financial_connections").select("token_ciphertext").eq("id", id).maybeSingle(), "connectionToken") as Row | null;
    return r?.token_ciphertext ?? null;
  }
  async apiKeys(): Promise<ApiKeyRow[]> {
    const rows = check(await this.from("api_keys").select("id,name,prefix,created_at,last_used_at,revoked_at").order("created_at", { ascending: false }), "apiKeys") as Row[];
    return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.created_at, lastUsedAt: r.last_used_at, revoked: !!r.revoked_at }));
  }
  async createApiKey(name: string, hash: string, prefix: string): Promise<ApiKeyRow> {
    const r = check(await this.from("api_keys").insert({ name, key_hash: hash, prefix }).select("id,name,prefix,created_at").single(), "createApiKey") as Row;
    return { id: r.id, name: r.name, prefix: r.prefix, createdAt: r.created_at, revoked: false };
  }
  async revokeApiKey(id: string) { check(await this.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id), "revokeApiKey"); }
  async recordSync(connectionId: string, ok: boolean, error?: string) {
    const now = new Date().toISOString();
    const patch: Row = { last_attempted_sync: now, status: ok ? "active" : "error", last_error: ok ? null : error ?? "error" };
    if (ok) patch.last_successful_sync = now;
    check(await this.from("financial_connections").update(patch).eq("id", connectionId), "recordSync");
  }
  async deleteConnection(id: string) { check(await this.from("financial_connections").delete().eq("id", id), "deleteConnection"); }
  async lastJob(): Promise<SyncJob | null> {
    const r = check(await this.from("sync_jobs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(), "lastJob") as Row | null;
    return r ? { startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, stats: r.stats } : null;
  }
  async recordJob(j: SyncJob) {
    check(await this.from("sync_jobs").insert({ kind: "daily", status: j.status, started_at: j.startedAt, finished_at: j.finishedAt ?? null, stats: j.stats ?? null }), "recordJob");
  }

  /* budgets & suggestions */
  async budgets(): Promise<Budget[]> {
    const rows = check(await this.from("budgets").select("category_id, amount_agorot"), "budgets") as Row[];
    return rows.map((r) => ({ categoryId: r.category_id, amount: Number(r.amount_agorot) })).filter((b) => b.categoryId == null || b.amount > 0);
  }
  async setBudget(categoryId: string | null, amount: number, reason: "user" | "suggestion_approved" | "onboarding") {
    let q = this.from("budgets").select("id, amount_agorot");
    q = categoryId == null ? q.is("category_id", null) : q.eq("category_id", categoryId);
    const existing = check(await q.maybeSingle(), "budget") as Row | null;
    if (existing) check(await this.from("budgets").update({ amount_agorot: amount, updated_at: new Date().toISOString() }).eq("id", existing.id), "budgetUpdate");
    else check(await this.from("budgets").insert({ user_id: this.userId, category_id: categoryId, amount_agorot: amount }), "budgetInsert");
    check(await this.from("budget_history").insert({ user_id: this.userId, category_id: categoryId, old_amount_agorot: existing?.amount_agorot ?? null, new_amount_agorot: amount, reason }), "budgetHistory");
    if (categoryId == null) await this.saveProfile({ variableTarget: amount });
  }
  async suggestions(status?: Suggestion["status"]): Promise<Suggestion[]> {
    let q = this.from("ai_suggestions").select("*").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    return (check(await q, "suggestions") as Row[]).map((r) => ({ id: r.id, kind: r.kind, categoryId: r.category_id, payload: r.payload, status: r.status, period: r.period }));
  }
  async upsertSuggestions(ss: Omit<Suggestion, "id">[]) {
    if (!ss.length) return;
    // ignoreDuplicates: a suggestion the user already saw (any status) for that period is never re-offered
    for (const s of ss) {
      const res = await this.from("ai_suggestions").insert({ user_id: this.userId, kind: s.kind, category_id: s.categoryId ?? null, payload: s.payload, status: s.status, period: s.period ?? null });
      if (res.error && res.error.code !== "23505") throw new Error(`upsertSuggestions: ${res.error.message}`);
    }
  }
  async resolveSuggestion(id: string, status: Suggestion["status"]) {
    check(await this.from("ai_suggestions").update({ status, resolved_at: new Date().toISOString() }).eq("id", id), "resolveSuggestion");
  }

  /* accounts / notifications */
  async accounts(): Promise<AccountRow[]> {
    const rows = check(await this.from("accounts").select("*, financial_connections(status,last_successful_sync)"), "accounts") as Row[];
    return rows.map((r) => ({ id: r.id, kind: r.kind, institution: r.institution, name: r.name, balance: r.balance_agorot == null ? null : Number(r.balance_agorot), lastSync: r.financial_connections?.last_successful_sync ?? null, status: r.financial_connections?.status ?? "active", externalId: r.external_id, connectionId: r.connection_id }));
  }
  async notifications(): Promise<Notification[]> {
    const rows = check(await this.from("notifications").select("*").order("created_at", { ascending: false }).limit(50), "notifications") as Row[];
    return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, dedupeKey: r.dedupe_key, readAt: r.read_at, createdAt: r.created_at }));
  }
  async addNotifications(ns: Omit<Notification, "id" | "createdAt">[]) {
    for (const n of ns) {
      const res = await this.from("notifications").insert({ user_id: this.userId, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, dedupe_key: n.dedupeKey ?? null });
      if (res.error && res.error.code !== "23505") throw new Error(`addNotifications: ${res.error.message}`);
    }
  }

  /* snapshots & audit */
  async snapshot(date: IsoDate) {
    const r = check(await this.from("daily_financial_snapshots").select("payload, computed_through").eq("snapshot_date", date).maybeSingle(), "snapshot") as Row | null;
    return r ? { payload: r.payload as DashboardPayload, computedThrough: r.computed_through as string } : null;
  }
  async saveSnapshot(date: IsoDate, payload: DashboardPayload) {
    check(await this.from("daily_financial_snapshots").upsert({ user_id: this.userId, snapshot_date: date, payload, computed_through: new Date().toISOString() }, { onConflict: "user_id,snapshot_date" }), "saveSnapshot");
  }
  async audit(action: string, target?: string, meta?: Record<string, unknown>) {
    await this.from("audit_logs").insert({ user_id: this.userId, action, target: target ?? null, meta: meta ?? null });
  }
}
