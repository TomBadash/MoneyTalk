import type { Txn, Agorot } from "@/domain/types";

/** Only genuine expenses are consumption. Savings/investments/transfers/income are not. */
export const isConsumption = (t: Txn) => t.financialType === "expense" && t.transactionType === "debit";

export const sum = (ts: Txn[]): Agorot => ts.reduce((s, t) => s + t.amount, 0);

export const consumption = (ts: Txn[]) => ts.filter(isConsumption);

export const isFixed = (t: Txn) => t.consumptionType === "fixed";
/** "Variable spending" = consumption that is not fixed and not a one-off. */
export const isVariable = (t: Txn) =>
  isConsumption(t) && t.consumptionType !== "fixed" && t.consumptionType !== "one_off";
