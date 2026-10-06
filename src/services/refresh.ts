import type { IsoDate } from "@/domain/types";
import type { Repo } from "@/db/repo";
import { computeDashboard } from "./dashboard";

/** Recompute and store today's dashboard snapshot after any write (cheap, deterministic, no AI). */
export async function refreshSnapshot(repo: Repo, today: IsoDate): Promise<void> {
  const payload = await computeDashboard(repo, today, false);
  await repo.saveSnapshot(today, payload);
}
