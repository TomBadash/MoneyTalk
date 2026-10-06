import type { IsoDate } from "@/domain/types";
import { MemoryRepo } from "./memory";
import { DEMO_ACCOUNTS, DEMO_BUDGETS, DEMO_PROFILE, generateDemoDrafts } from "./seed/demo";
import { ingestDrafts } from "@/services/ingest";
import { indexRules } from "@/classify/memory";

/** Build a fully-populated demo repo (classified through the real pipeline). */
export async function buildDemoRepo(today: IsoDate): Promise<MemoryRepo> {
  const repo = new MemoryRepo();
  repo.seed({ profile: DEMO_PROFILE, budgets: DEMO_BUDGETS, accounts: DEMO_ACCOUNTS });
  await repo.saveGoal({ name: "קרן חירום", kind: "emergency_fund", target: 3_000_000, current: 1_450_000, monthlyContribution: 300_000, targetDate: null });
  await repo.saveGoal({ name: "חופשה ביפן", kind: "vacation", target: 800_000, current: 210_000, monthlyContribution: null, targetDate: `${Number(today.slice(0, 4)) + 1}-03-01` });
  await repo.saveGoal({ name: "מחשב חדש", kind: "purchase", target: 700_000, current: 520_000, monthlyContribution: 90_000, targetDate: null });
  await ingestDrafts(repo, generateDemoDrafts(today), today, { rules: indexRules([]), history: [] });
  return repo;
}

const cache = new Map<string, Promise<MemoryRepo>>();
/** Demo data is deterministic per day, so one instance per server process per day is enough. */
export function getDemoRepo(today: IsoDate): Promise<MemoryRepo> {
  let p = cache.get(today);
  if (!p) { cache.clear(); p = buildDemoRepo(today); cache.set(today, p); }
  return p;
}
