import type { IsoDate } from "@/domain/types";
import { MemoryRepo } from "./memory";
import { DEMO_ACCOUNTS, DEMO_BUDGETS, DEMO_PROFILE, generateDemoDrafts } from "./seed/demo";
import { ingestDrafts } from "@/services/ingest";
import { indexRules } from "@/classify/memory";

/** Build a fully-populated demo repo (classified through the real pipeline). */
export async function buildDemoRepo(today: IsoDate): Promise<MemoryRepo> {
  const repo = new MemoryRepo();
  repo.seed({ profile: DEMO_PROFILE, budgets: DEMO_BUDGETS, accounts: DEMO_ACCOUNTS });
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
