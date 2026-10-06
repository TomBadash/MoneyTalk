import type { Txn } from "@/domain/types";
import { diffDays } from "./period";

const CARD_BILL = /(ויזה|כאל|ישראכרט|מקס|לאומי קארד|אמריקן אקספרס|isracard|cal\b|max\b|visa|leumi card)/i;

/**
 * Marks bank debits that pay a credit-card statement as transfers when the card's own
 * transactions were already imported (otherwise the spend would be counted twice).
 * Heuristic: description names a card issuer AND the amount ≈ sum of card txns in the
 * ~35 days before (±2%), or simply looks like a card bill when card txns exist.
 * Returns ids of bank txns to reclassify as `transfer`.
 */
export function detectCardBillPayments(bank: Txn[], cardTxns: Txn[]): string[] {
  if (cardTxns.length === 0) return [];
  const ids: string[] = [];
  for (const t of bank) {
    if (t.transactionType !== "debit" || !CARD_BILL.test(`${t.merchantRaw} ${t.descriptionRaw}`)) continue;
    const window = cardTxns.filter((c) => {
      const d = diffDays(t.date, c.date);
      return d >= 0 && d <= 35;
    });
    const total = window.reduce((s, c) => s + c.amount, 0);
    if (total > 0 && Math.abs(total - t.amount) / t.amount <= 0.02) ids.push(t.id);
    else if (window.length >= 3) ids.push(t.id);
  }
  return ids;
}

/** Own-account transfers: opposite-direction pair, same amount, within 2 days, different accounts. */
export function detectOwnTransfers(ts: Txn[]): string[] {
  const out = new Set<string>();
  const debits = ts.filter((t) => t.transactionType === "debit");
  const credits = ts.filter((t) => t.transactionType === "credit");
  for (const d of debits) {
    const m = credits.find(
      (c) => !out.has(c.id) && c.amount === d.amount && c.accountId && d.accountId &&
        c.accountId !== d.accountId && Math.abs(diffDays(c.date, d.date)) <= 2,
    );
    if (m) { out.add(d.id); out.add(m.id); }
  }
  return [...out];
}
