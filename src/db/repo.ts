import type {
  AccountRow, Budget, IsoDate, MerchantRow, Notification, ProductRow, Profile, RecurringRule, Suggestion, Txn,
} from "@/domain/types";
import type { LearnedRule } from "@/classify/memory";
import type { DashboardPayload } from "@/services/dashboard";

export type TxnFilter = {
  from?: IsoDate; to?: IsoDate; merchantNormalized?: string; productId?: string; categoryId?: string;
  needsReview?: boolean; updatedAfter?: string; limit?: number;
};

/**
 * Persistence boundary. Everything above this line (engine/classify/services) is storage-agnostic;
 * SupabaseRepo enforces RLS through the user's session, MemoryRepo powers demo/dev without env vars.
 */
export interface Repo {
  readonly kind: "supabase" | "memory";
  profile(): Promise<Profile & { onboarded: boolean; displayName?: string | null }>;
  saveProfile(p: Partial<Profile> & { onboarded?: boolean; displayName?: string | null }): Promise<void>;

  txns(f?: TxnFilter): Promise<Txn[]>;
  txn(id: string): Promise<Txn | null>;
  countTxns(): Promise<number>;
  insertTxns(ts: Txn[]): Promise<Txn[]>; // returns the rows actually inserted (dedupe-safe)
  updateTxn(id: string, patch: Partial<Txn>): Promise<void>;
  softDeleteTxn(id: string): Promise<void>;
  restoreTxn(id: string): Promise<void>;

  rules(): Promise<LearnedRule[]>;
  upsertRules(rs: LearnedRule[]): Promise<void>;

  products(): Promise<ProductRow[]>;
  upsertProduct(p: Omit<ProductRow, "id">): Promise<ProductRow>;
  merchants(): Promise<MerchantRow[]>;
  upsertMerchant(m: Omit<MerchantRow, "id">): Promise<MerchantRow>;

  recurring(): Promise<RecurringRule[]>;
  replaceDetectedRecurring(rs: RecurringRule[]): Promise<void>;

  budgets(): Promise<Budget[]>;
  setBudget(categoryId: string | null, amount: number, reason: "user" | "suggestion_approved" | "onboarding"): Promise<void>;
  suggestions(status?: Suggestion["status"]): Promise<Suggestion[]>;
  upsertSuggestions(ss: Omit<Suggestion, "id">[]): Promise<void>;
  resolveSuggestion(id: string, status: Suggestion["status"]): Promise<void>;

  accounts(): Promise<AccountRow[]>;
  notifications(): Promise<Notification[]>;
  addNotifications(ns: Omit<Notification, "id" | "createdAt">[]): Promise<void>;

  snapshot(date: IsoDate): Promise<{ payload: DashboardPayload; computedThrough: string } | null>;
  saveSnapshot(date: IsoDate, payload: DashboardPayload): Promise<void>;
  audit(action: string, target?: string, meta?: Record<string, unknown>): Promise<void>;
  /** Irreversible: removes imported/typed financial data only (keeps profile). */
  deleteAllTransactions(): Promise<void>;
}
