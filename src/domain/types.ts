// Pure domain types. Money is ALWAYS integer agorot (1 ₪ = 100). Dates are
// calendar dates "YYYY-MM-DD" (Asia/Jerusalem wall-clock); no I/O in this layer.

export type Agorot = number;
export type IsoDate = string;

export type FinancialType = "expense" | "income" | "savings" | "investment" | "transfer";
export type ConsumptionType = "fixed" | "variable_essential" | "lifestyle" | "one_off";
export type Interval = "weekly" | "monthly" | "bimonthly" | "quarterly" | "yearly";
export type PaymentMethod = "card" | "bank" | "cash" | "bit" | "other";

export type Txn = {
  id: string;
  externalId?: string | null;
  accountId?: string | null;
  sourceProvider: string; // 'manual' | 'api' | 'csv' | provider id
  date: IsoDate; // transaction_date
  postingDate?: IsoDate | null;
  merchantRaw: string;
  merchantNormalized: string;
  descriptionRaw: string;
  amount: Agorot; // positive magnitude; direction is carried by financialType
  currency: string;
  transactionType: "debit" | "credit";
  productId?: string | null;
  subcategoryId?: string | null;
  categoryId?: string | null;
  parentCategoryId?: string | null;
  financialType: FinancialType;
  consumptionType?: ConsumptionType | null; // fixed_or_variable family
  recurringStatus: "none" | "recurring" | "suspected";
  paymentMethod?: PaymentMethod | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  aiConfidence?: number | null;
  aiClassificationVersion?: string | null;
  aiReasoningSummary?: string | null;
  userCorrected: boolean;
  notes?: string | null;
  merchantId?: string | null;
  recurringId?: string | null;
  needsReview?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CategoryNode = {
  id: string;
  parentId: string | null;
  level: "parent" | "category" | "subcategory";
  he: string;
  icon?: string;
  color?: string;
  consumptionType?: ConsumptionType | null;
  financialType: FinancialType;
};

export type RecurringRule = {
  id: string;
  merchantNormalized: string;
  title: string;
  amount: Agorot;
  interval: Interval;
  dayOfMonth?: number | null;
  nextExpected: IsoDate;
  lastSeen: IsoDate;
  active: boolean;
  categoryId?: string | null;
  consumptionType?: ConsumptionType | null;
  source?: "detected" | "user";
  amountVariable?: boolean;
};

export type Profile = {
  monthlyIncome: Agorot;
  monthlyRent: Agorot;
  monthlySavingsTarget: Agorot;
  monthlyInvestmentTarget: Agorot;
  variableTarget?: Agorot | null; // user-set monthly variable spending target
};

export type ProductRow = {
  id: string; name: string; normalized: string; brand?: string | null;
  subcategoryId?: string | null; categoryId?: string | null; parentCategoryId?: string | null;
};
export type MerchantRow = { id: string; name: string; normalized: string; defaultSubcategoryId?: string | null };
export type AccountRow = { id: string; kind: "bank" | "credit_card" | "cash" | "brokerage" | "pension" | "provident" | "education_fund" | "crypto"; institution: string; name: string; balance?: Agorot | null; lastSync?: string | null; status?: "active" | "needs_reauth" | "error" | "revoked" | null; externalId?: string | null; connectionId?: string | null };
export type Budget = { categoryId: string | null; amount: Agorot };
export type Suggestion = { id: string; kind: "budget" | "category_rule" | "recurring"; categoryId?: string | null; payload: Record<string, unknown>; status: "pending" | "approved" | "modified" | "ignored"; period?: string | null };
export type Notification = { id: string; kind: string; title: string; body?: string | null; link?: string | null; dedupeKey?: string | null; readAt?: string | null; createdAt: string };

export type Goal = {
  id: string; name: string; kind: "monthly_saving" | "emergency_fund" | "vacation" | "purchase" | "investment";
  target: Agorot; current: Agorot; monthlyContribution?: Agorot | null; targetDate?: IsoDate | null;
};
export type Connection = {
  id: string; provider: string; institution: string; status: "active" | "needs_reauth" | "error" | "revoked";
  lastSuccessfulSync?: string | null; lastAttemptedSync?: string | null; lastError?: string | null; consentExpiresAt?: string | null;
};
export type SyncJob = { startedAt: string; finishedAt?: string | null; status: "running" | "ok" | "partial" | "error"; stats?: Record<string, unknown> | null };

export type ApiKeyRow = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt?: string | null; revoked: boolean };
export type NotificationPrefs = { budget_80: boolean; weekly_pace: boolean; price_change: boolean; new_recurring: boolean; weekly_left: boolean };
