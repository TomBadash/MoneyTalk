import type { IsoDate } from "@/domain/types";
import type { Repo } from "@/db/repo";
import type { FinancialDataProvider, ProviderTxn } from "@/providers/types";
import { ingestDrafts, type Draft } from "./ingest";
import { addDays } from "@/engine/period";
import { detectCardBillPayments, detectOwnTransfers } from "@/engine/reconcile";
import { resolveSub } from "@/classify/taxonomy";

export const FRIENDLY_SYNC_ERROR = "לא הצלחנו לעדכן את הנתונים מהחשבון. הנתונים האחרונים שלך עדיין שמורים — ננסה שוב אוטומטית.";

const toDraft = (t: ProviderTxn, source: string, accountId: string): Draft => ({
  description: t.description, merchant: t.merchant ?? t.description, amount: t.amount, date: t.date, direction: t.direction,
  source, externalId: t.externalId, accountId, installmentNumber: t.installmentNumber, installmentTotal: t.installmentTotal,
});

/** Import provider transactions for already-parsed rows (used by sync and CSV import). */
export async function importProviderTxns(repo: Repo, rows: ProviderTxn[], source: string, accountIdFor: (ext: string) => string | undefined, today: IsoDate): Promise<number> {
  const drafts = rows.flatMap((r) => { const acc = accountIdFor(r.accountExternalId); return acc ? [toDraft(r, source, acc)] : []; });
  const created = await ingestDrafts(repo, drafts, today);
  return created.length;
}

/**
 * Sync one connection. A failure marks the connection unhealthy with a human message and
 * returns normally — a temporary sync problem must never block the rest of the app.
 */
export async function syncConnection(
  repo: Repo, connectionId: string, provider: FinancialDataProvider, decrypt: (c: string) => string, today: IsoDate,
): Promise<{ ok: boolean; imported: number }> {
  try {
    const cipher = await repo.connectionToken(connectionId);
    if (!cipher) throw new Error("no token");
    const handle = { token: decrypt(cipher) };
    const accounts = (await repo.accounts()).filter((a) => a.connectionId === connectionId && a.externalId);
    const since = addDays(today, -400);
    let imported = 0;
    for (const a of accounts) {
      const rows = await provider.fetchTransactions(handle, a.externalId!, since, today);
      imported += await importProviderTxns(repo, rows, provider.id, (ext) => accounts.find((x) => x.externalId === ext)?.id, today);
    }
    await repo.recordSync(connectionId, true);
    return { ok: true, imported };
  } catch (e) {
    await repo.recordSync(connectionId, false, FRIENDLY_SYNC_ERROR).catch(() => undefined);
    void e;
    return { ok: false, imported: 0 };
  }
}

/**
 * Avoid double counting: card statements paid from the bank and own-account transfers are
 * re-labelled `transfer` (never consumption). Skips anything the user already corrected.
 */
export async function reconcileRecent(repo: Repo, today: IsoDate): Promise<number> {
  const [txns, accounts] = await Promise.all([repo.txns({ from: addDays(today, -75), to: today }), repo.accounts()]);
  const kind = new Map(accounts.map((a) => [a.id, a.kind]));
  const open = txns.filter((t) => !t.userCorrected && t.financialType === "expense");
  const bank = open.filter((t) => t.accountId && kind.get(t.accountId) === "bank" && t.transactionType === "debit");
  const card = txns.filter((t) => t.accountId && kind.get(t.accountId) === "credit_card" && t.transactionType === "debit");
  const ids = new Set([...detectCardBillPayments(bank, card), ...detectOwnTransfers(txns.filter((t) => t.accountId))]);
  let n = 0;
  for (const t of open) {
    if (!ids.has(t.id)) continue;
    const r = resolveSub(kind.get(t.accountId ?? "") === "bank" && /כרטיס|ויזה|כאל|ישראכרט|מקס/i.test(`${t.merchantRaw} ${t.descriptionRaw}`) ? "s_card_bill" : "s_transfer");
    await repo.updateTxn(t.id, {
      subcategoryId: r.subcategoryId, categoryId: r.categoryId, parentCategoryId: r.parentCategoryId, financialType: "transfer", consumptionType: null,
      needsReview: false, aiReasoningSummary: "זוהה כהעברה/חיוב כרטיס — לא נספר כהוצאה כדי לא לספור פעמיים.",
    });
    n++;
  }
  return n;
}
