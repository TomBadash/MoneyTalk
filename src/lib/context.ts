import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Repo } from "@/db/repo";
import { SupabaseRepo } from "@/db/supabase";
import { getDemoRepo } from "@/db/demo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { todayIsrael } from "@/services/clock";
import type { IsoDate } from "@/domain/types";

export type AppContext = {
  /** Where pages read from: the user's data, or the demo dataset while they have none. */
  read: Repo;
  /** Where mutations go: always the user's real repo (first real entry ends demo mode). */
  write: Repo;
  /** True while showing sample data. */
  demo: boolean;
  /** No Supabase configured: local in-memory mode (nothing is persisted). */
  local: boolean;
  today: IsoDate;
  userId: string | null;
  email: string | null;
  onboarded: boolean;
  displayName: string | null;
};

/** Per-request context (memoised by React `cache`). Redirects to /login if there is no session. */
export const getContext = cache(async (): Promise<AppContext> => {
  const today = todayIsrael();

  if (!isSupabaseConfigured()) {
    const demo = await getDemoRepo(today);
    const p = await demo.profile();
    return { read: demo, write: demo, demo: true, local: true, today, userId: null, email: null, onboarded: true, displayName: p.displayName ?? null };
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const real = new SupabaseRepo(sb, user.id);
  const [count, profile] = await Promise.all([real.countTxns(), real.profile()]);
  const demo = count === 0;
  return {
    read: demo ? await getDemoRepo(today) : real, write: real, demo, local: false, today,
    userId: user.id, email: user.email ?? null, onboarded: profile.onboarded, displayName: profile.displayName ?? null,
  };
});

/** For API routes: same as getContext but returns null instead of redirecting. */
export async function getContextOrNull(): Promise<AppContext | null> {
  if (!isSupabaseConfigured()) return getContext();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user ? getContext() : null;
}
