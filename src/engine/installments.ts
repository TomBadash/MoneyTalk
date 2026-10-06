import type { Agorot, Txn } from "@/domain/types";

export type InstallmentPlan = {
  merchant: string;
  total: Agorot; // full purchase amount
  monthly: Agorot;
  paid: number;
  remaining: number;
};

/** Group installment charges into plans (same merchant + same monthly amount + same total count). */
export function installmentPlans(ts: Txn[]): InstallmentPlan[] {
  const plans = new Map<string, InstallmentPlan>();
  for (const t of ts) {
    if (!t.installmentTotal || t.installmentTotal < 2 || !t.installmentNumber) continue;
    const key = `${t.merchantNormalized}|${t.amount}|${t.installmentTotal}`;
    const p = plans.get(key) ?? {
      merchant: t.merchantNormalized, total: t.amount * t.installmentTotal, monthly: t.amount,
      paid: 0, remaining: t.installmentTotal,
    };
    p.paid = Math.max(p.paid, t.installmentNumber);
    p.remaining = t.installmentTotal - p.paid;
    plans.set(key, p);
  }
  return [...plans.values()];
}

/** Purchase basis: charge the whole price on the first installment; cash-flow basis = as billed. */
export function purchaseBasisAmount(t: Txn): Agorot {
  if (t.installmentTotal && t.installmentTotal > 1) {
    return t.installmentNumber === 1 ? t.amount * t.installmentTotal : 0;
  }
  return t.amount;
}
