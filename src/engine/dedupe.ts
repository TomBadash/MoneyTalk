import type { Txn } from "@/domain/types";

/** Stable composite key used when a provider gives no external id. */
export function dedupeKey(t: Pick<Txn, "accountId" | "date" | "amount" | "merchantNormalized" | "transactionType" | "installmentNumber">): string {
  return [t.accountId ?? "-", t.date, t.amount, t.merchantNormalized, t.transactionType, t.installmentNumber ?? 0].join("|");
}

/** Returns only incoming txns that are new (by external id, then composite key). */
export function filterNew(existing: Txn[], incoming: Txn[]): Txn[] {
  const ext = new Set(existing.filter((t) => t.externalId).map((t) => `${t.accountId}|${t.externalId}`));
  const keys = new Set(existing.map(dedupeKey));
  const out: Txn[] = [];
  for (const t of incoming) {
    const e = t.externalId ? `${t.accountId}|${t.externalId}` : null;
    if (e && ext.has(e)) continue;
    const k = dedupeKey(t);
    if (!e && keys.has(k)) continue;
    if (e) ext.add(e);
    keys.add(k);
    out.push(t);
  }
  return out;
}
