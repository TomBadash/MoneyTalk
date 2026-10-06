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
};

export type Profile = {
  monthlyIncome: Agorot;
  monthlyRent: Agorot;
  monthlySavingsTarget: Agorot;
  monthlyInvestmentTarget: Agorot;
  variableTarget?: Agorot | null; // user-set monthly variable spending target
};
