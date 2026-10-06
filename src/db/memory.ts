import type {
  AccountRow, ApiKeyRow, Budget, Connection, Goal, NotificationPrefs, SyncJob, IsoDate, MerchantRow, Notification, ProductRow, Profile, RecurringRule, Suggestion, Txn,
} from "@/domain/types";
import type { LearnedRule } from "@/classify/memory";
import { ruleId } from "@/classify/memory";
import type { Repo, TxnFilter } from "./repo";
import type { DashboardPayload } from "@/services/dashboard";

type ProfileRow = Profile & { onboarded: boolean; displayName?: string | null; notificationPrefs?: NotificationPrefs };
const uid = () => crypto.randomUUID();

/** In-process repository: demo mode (read-mostly) and local dev without Supabase env vars. */
export class MemoryRepo implements Repo {
  readonly kind = "memory" as const;
  private _profile: ProfileRow = { monthlyIncome: 0, monthlyRent: 0, monthlySavingsTarget: 0, monthlyInvestmentTarget: 0, variableTarget: null, onboarded: false };
  private _txns = new Map<string, Txn>();
  private _rules = new Map<string, LearnedRule>();
  private _products = new Map<string, ProductRow>();
  private _merchants = new Map<string, MerchantRow>();
  private _recurring: RecurringRule[] = [];
  private _budgets: Budget[] = [];
  private _suggestions = new Map<string, Suggestion>();
  private _accounts: AccountRow[] = [];
  private _notifications: Notification[] = [];
  private _snapshots = new Map<IsoDate, { payload: DashboardPayload; computedThrough: string }>();
  readonly auditLog: { action: string; target?: string; meta?: unknown }[] = [];

  seed(init: { profile?: ProfileRow; budgets?: Budget[]; accounts?: AccountRow[] }) {
    if (init.profile) this._profile = init.profile;
    if (init.budgets) this._budgets = init.budgets;
    if (init.accounts) this._accounts = init.accounts;
  }

  async profile() { return this._profile; }
  async saveProfile(p: Partial<ProfileRow>) { this._profile = { ...this._profile, ...p }; }

  async txns(f: TxnFilter = {}) {
    let rows = [...this._txns.values()].filter((t) => !(t as Txn & { deleted?: boolean }).deleted);
    if (f.from) rows = rows.filter((t) => t.date >= f.from!);
    if (f.to) rows = rows.filter((t) => t.date <= f.to!);
    if (f.merchantNormalized) rows = rows.filter((t) => t.merchantNormalized === f.merchantNormalized);
    if (f.productId) rows = rows.filter((t) => t.productId === f.productId);
    if (f.categoryId) rows = rows.filter((t) => t.categoryId === f.categoryId || t.subcategoryId === f.categoryId || t.parentCategoryId === f.categoryId);
    if (f.needsReview != null) rows = rows.filter((t) => !!t.needsReview === f.needsReview);
    if (f.updatedAfter) rows = rows.filter((t) => (t.updatedAt ?? "") > f.updatedAfter!);
    rows.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return f.limit ? rows.slice(0, f.limit) : rows;
  }
  async txn(id: string) { const t = this._txns.get(id); return t && !(t as Txn & { deleted?: boolean }).deleted ? t : null; }
  async countTxns() { return (await this.txns()).length; }
  async insertTxns(ts: Txn[]) {
    const now = new Date().toISOString();
    const done: Txn[] = [];
    for (const t of ts) {
      const dup = t.externalId && [...this._txns.values()].some((x) => x.externalId === t.externalId && x.accountId === t.accountId && x.sourceProvider === t.sourceProvider);
      const monthDup = t.recurringId && t.sourceProvider === "recurring" && [...this._txns.values()].some((x) => x.recurringId === t.recurringId && x.sourceProvider === "recurring" && x.date.slice(0, 7) === t.date.slice(0, 7));
      if (dup || monthDup) continue;
      const row = { ...t, createdAt: t.createdAt ?? now, updatedAt: now };
      this._txns.set(row.id, row);
      done.push(row);
    }
    this._snapshots.clear();
    return done;
  }
  async updateTxn(id: string, patch: Partial<Txn>) {
    const t = this._txns.get(id);
    if (!t) return;
    const raw = t.sourceProvider !== "manual" && t.sourceProvider !== "api" && t.sourceProvider !== "recurring";
    const safe = { ...patch };
    if (raw) for (const k of ["externalId", "merchantRaw", "descriptionRaw", "amount", "date", "sourceProvider"] as const) delete safe[k]; // raw imports are immutable
    this._txns.set(id, { ...t, ...safe, updatedAt: new Date().toISOString() });
    this._snapshots.clear();
  }
  async softDeleteTxn(id: string) { const t = this._txns.get(id); if (t) { this._txns.set(id, { ...t, deleted: true } as Txn); this._snapshots.clear(); } }
  async restoreTxn(id: string) { const t = this._txns.get(id) as (Txn & { deleted?: boolean }) | undefined; if (t) { this._txns.set(id, { ...t, deleted: false } as Txn); this._snapshots.clear(); } }

  async rules() { return [...this._rules.values()]; }
  async upsertRules(rs: LearnedRule[]) { for (const r of rs) this._rules.set(ruleId(r), r); }

  async products() { return [...this._products.values()]; }
  async upsertProduct(p: Omit<ProductRow, "id">) {
    const found = [...this._products.values()].find((x) => x.normalized === p.normalized);
    if (found) return found;
    const row = { ...p, id: uid() };
    this._products.set(row.id, row);
    return row;
  }
  async merchants() { return [...this._merchants.values()]; }
  async upsertMerchant(m: Omit<MerchantRow, "id">) {
    const found = [...this._merchants.values()].find((x) => x.normalized === m.normalized);
    if (found) return found;
    const row = { ...m, id: uid() };
    this._merchants.set(row.id, row);
    return row;
  }

  async recurring() { return this._recurring; }
  async replaceDetectedRecurring(rs: RecurringRule[]) { this._recurring = rs; }

  async addUserRecurring(r: Omit<RecurringRule, "id">) {
    const row = { ...r, id: uid(), source: "user" as const };
    this._recurring = [...this._recurring, row];
    return row;
  }
  async deleteRecurring(id: string) { this._recurring = this._recurring.filter((r) => r.id !== id); }
  async updateRecurring(id: string, patch: Partial<RecurringRule>) { this._recurring = this._recurring.map((r) => (r.id === id ? { ...r, ...patch } : r)); }

  private _goals = new Map<string, Goal>();
  async goals() { return [...this._goals.values()]; }
  async saveGoal(g: Omit<Goal, "id"> & { id?: string }) { const id = g.id ?? uid(); this._goals.set(id, { ...g, id }); }
  async deleteGoal(id: string) { this._goals.delete(id); }

  private _connections: Connection[] = [];
  private _jobs: SyncJob[] = [];
  async connections() { return this._connections; }
  async createAccount(a: Omit<AccountRow, "id">) { const row = { ...a, id: uid(), status: a.status ?? ("active" as const) }; this._accounts = [...this._accounts, row]; return row; }
  private _tokens = new Map<string, string>();
  private _keys: (ApiKeyRow & { hash: string })[] = [];
  async createConnection(c: { provider: string; institution: string; accounts: Omit<AccountRow, "id">[]; tokenCiphertext?: string; consentExpiresAt?: string | null }) {
    const connection: Connection = { id: uid(), provider: c.provider, institution: c.institution, status: "active", lastSuccessfulSync: null, lastAttemptedSync: null, lastError: null, consentExpiresAt: c.consentExpiresAt ?? null };
    const accounts = c.accounts.map((a) => ({ ...a, id: uid(), status: "active" as const, connectionId: connection.id }));
    this._connections.push(connection);
    this._accounts = [...this._accounts, ...accounts];
    if (c.tokenCiphertext) this._tokens.set(connection.id, c.tokenCiphertext);
    return { connection, accounts };
  }
  async connectionToken(id: string) { return this._tokens.get(id) ?? null; }
  async apiKeys() { return this._keys.map(({ hash, ...k }) => (void hash, k)); }
  async createApiKey(name: string, hash: string, prefix: string) { const k = { id: uid(), name, prefix, hash, createdAt: new Date().toISOString(), revoked: false }; this._keys.push(k); const { hash: _h, ...pub } = k; void _h; return pub; }
  async revokeApiKey(id: string) { this._keys = this._keys.map((k) => (k.id === id ? { ...k, revoked: true } : k)); }
  async recordSync(connectionId: string, ok: boolean, error?: string) {
    const now = new Date().toISOString();
    this._connections = this._connections.map((c) => c.id !== connectionId ? c : { ...c, lastAttemptedSync: now, lastSuccessfulSync: ok ? now : c.lastSuccessfulSync, status: ok ? "active" : "error", lastError: ok ? null : error ?? "error" });
  }
  async deleteConnection(id: string) { this._connections = this._connections.filter((c) => c.id !== id); this._accounts = this._accounts.map((a) => (a.connectionId === id ? { ...a, connectionId: null, status: "revoked" as const } : a)); this._tokens.delete(id); }
  async lastJob() { return this._jobs.at(-1) ?? null; }
  async recordJob(j: SyncJob) { this._jobs.push(j); }

  async budgets() { return this._budgets.filter((b) => b.categoryId == null || b.amount > 0); }
  async setBudget(categoryId: string | null, amount: number, _reason?: "user" | "suggestion_approved" | "onboarding") {
    void _reason;
    this._budgets = [...this._budgets.filter((b) => b.categoryId !== categoryId), { categoryId, amount }];
    if (categoryId == null) this._profile = { ...this._profile, variableTarget: amount };
    this._snapshots.clear();
  }
  async suggestions(status?: Suggestion["status"]) { return [...this._suggestions.values()].filter((s) => !status || s.status === status); }
  async upsertSuggestions(ss: Omit<Suggestion, "id">[]) {
    for (const s of ss) {
      const found = [...this._suggestions.values()].find((x) => x.kind === s.kind && x.categoryId === s.categoryId && x.period === s.period);
      if (found) continue; // never re-offer one the user already saw this period
      const id = uid();
      this._suggestions.set(id, { ...s, id });
    }
  }
  async resolveSuggestion(id: string, status: Suggestion["status"]) { const s = this._suggestions.get(id); if (s) this._suggestions.set(id, { ...s, status }); }

  async accounts() { return this._accounts; }
  async notifications() { return this._notifications; }
  async addNotifications(ns: Omit<Notification, "id" | "createdAt">[]) {
    for (const n of ns) {
      if (n.dedupeKey && this._notifications.some((x) => x.dedupeKey === n.dedupeKey)) continue;
      this._notifications.unshift({ ...n, id: uid(), createdAt: new Date().toISOString() });
    }
  }

  async markNotificationsRead() { const now = new Date().toISOString(); this._notifications = this._notifications.map((n) => ({ ...n, readAt: n.readAt ?? now })); }

  async snapshot(date: IsoDate) { return this._snapshots.get(date) ?? null; }
  async saveSnapshot(date: IsoDate, payload: DashboardPayload) { this._snapshots.set(date, { payload, computedThrough: new Date().toISOString() }); }
  async audit(action: string, target?: string, meta?: Record<string, unknown>) { this.auditLog.push({ action, target, meta }); }
  async deleteAllTransactions() { this._txns.clear(); this._snapshots.clear(); }
}
