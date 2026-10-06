import type { IsoDate, RecurringRule, Txn } from "@/domain/types";
import type { Repo } from "@/db/repo";
import { classify } from "@/classify/pipeline";
import { indexRules } from "@/classify/memory";
import { normalizeText } from "@/classify/normalize";
import { nextDate } from "@/engine/recurring";
import { toTxn } from "./ingest";

/**
 * Post transactions for *user-defined* recurring rules that came due (typed rent, gym, etc. when no
 * bank feed provides them). Idempotent: one posting per rule per month (DB unique index + repo check).
 */
export async function postDueRecurring(repo: Repo, today: IsoDate): Promise<number> {
  const rules = (await repo.recurring()).filter((r) => r.source === "user" && r.active);
  const learned = indexRules(await repo.rules());
  let posted = 0;
  for (const r of rules) {
    let due = r.nextExpected;
    for (let guard = 0; due <= today && guard < 24; guard++) {
      const cls = classify({ description: r.title, amount: r.amount, rules: learned });
      const t: Txn = {
        ...toTxn({ description: r.title, merchant: r.title, amount: r.amount, date: due, source: "recurring" }, cls),
        merchantNormalized: normalizeText(r.title), consumptionType: "fixed", recurringStatus: "recurring", recurringId: r.id,
        needsReview: false, aiConfidence: 1, aiReasoningSummary: "חיוב קבוע שהגדרת.",
      };
      const [ins] = await repo.insertTxns([t]);
      if (ins) posted++;
      await repo.updateRecurring(r.id, { lastSeen: due, nextExpected: nextDate(due, r.interval) });
      due = nextDate(due, r.interval);
    }
  }
  return posted;
}

export type { RecurringRule };
