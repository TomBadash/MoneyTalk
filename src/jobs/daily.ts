import type { IsoDate } from "@/domain/types";
import type { Repo } from "@/db/repo";
import type { AiProvider } from "@/ai/provider";
import type { FinancialDataProvider } from "@/providers/types";
import { syncConnection, reconcileRecent } from "@/services/sync";
import { postDueRecurring } from "@/services/recurring-post";
import { refineWithAi } from "@/services/ai-refine";
import { ensureSuggestions } from "@/services/suggestions";
import { computeDashboard } from "@/services/dashboard";
import { detectRecurring, recurringAlerts } from "@/engine/recurring";
import { buildNotifications } from "@/engine/notifications";
import { addMonths, monthStart } from "@/engine/period";
import { isVariable } from "@/engine/consumption";
import { nodeInfo } from "@/classify/taxonomy";

export type JobDeps = {
  ai: AiProvider;
  provider: (id: string) => FinancialDataProvider | undefined;
  decrypt: (c: string) => string;
};

export type JobStats = Record<string, number | string>;

/**
 * Once-a-day, per user. Every step is independent: a failure is recorded and the job carries on,
 * so a flaky bank or AI call can never stop budgets, forecasts and the dashboard from refreshing.
 * Incremental: it only processes what is new/changed (dedupe on import, unreviewed rows for AI,
 * recent window for reconciliation) instead of recomputing history.
 */
export async function runDaily(repo: Repo, today: IsoDate, deps: JobDeps): Promise<{ status: "ok" | "partial"; stats: JobStats }> {
  const startedAt = new Date().toISOString();
  const stats: JobStats = {};
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { errors.push(name); stats[`${name}_error`] = e instanceof Error ? e.message.slice(0, 120) : "error"; }
  };

  await step("sync", async () => {
    let imported = 0, failed = 0;
    for (const c of (await repo.connections()).filter((c) => c.status !== "revoked")) {
      const p = deps.provider(c.provider);
      if (!p) continue;
      const r = await syncConnection(repo, c.id, p, deps.decrypt, today);
      imported += r.imported; if (!r.ok) failed++;
    }
    stats.imported = imported; stats.sync_failed = failed;
  });
  await step("reconcile", async () => { stats.reconciled = await reconcileRecent(repo, today); });
  await step("recurring_post", async () => { stats.recurring_posted = await postDueRecurring(repo, today); });
  await step("ai", async () => { const r = await refineWithAi(repo, deps.ai); stats.ai_asked = r.asked; stats.ai_updated = r.updated; });
  await step("recurring_detect", async () => {
    const txns = await repo.txns({ from: addMonths(monthStart(today), -14), to: today });
    const detected = detectRecurring(txns, today);
    await repo.replaceDetectedRecurring(detected);
    stats.recurring = detected.length;
  });
  await step("suggestions", async () => { await ensureSuggestions(repo, today); });
  await step("snapshot_and_notify", async () => {
    const payload = await computeDashboard(repo, today, false);
    await repo.saveSnapshot(today, payload);
    const [txns, budgets, profile] = await Promise.all([repo.txns({ from: addMonths(monthStart(today), -14), to: today }), repo.budgets(), repo.profile()]);
    const spent = new Map<string, number>();
    txns.filter((t) => t.date >= monthStart(today) && isVariable(t)).forEach((t) => t.categoryId && spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amount));
    const notes = buildNotifications({
      today, prefs: profile.notificationPrefs,
      categoryBudgets: budgets.filter((b) => b.categoryId).map((b) => ({ id: b.categoryId!, name: nodeInfo(b.categoryId).he, amount: b.amount, spent: spent.get(b.categoryId!) ?? 0 })),
      pace: { spentToDate: payload.pace.spentToDate, idealToDate: payload.pace.idealToDate, dayOfMonth: Number(today.slice(8, 10)) },
      remainingWeek: payload.remainingWeek, alerts: recurringAlerts(txns, detectRecurring(txns, today), today),
    });
    await repo.addNotifications(notes);
    stats.notifications = notes.length;
  });

  const status = errors.length ? "partial" : "ok";
  await repo.recordJob({ startedAt, finishedAt: new Date().toISOString(), status, stats }).catch(() => undefined);
  return { status, stats };
}
