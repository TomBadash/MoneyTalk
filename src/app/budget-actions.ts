"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { parseMoney } from "@/lib/money-input";
import { refreshSnapshot } from "@/services/refresh";
import { postDueRecurring } from "@/services/recurring-post";
import { isKnownSub } from "@/classify/taxonomy";
import { addMonths } from "@/engine/period";

async function done() {
  const ctx = await getContext();
  await refreshSnapshot(ctx.write, ctx.today).catch(() => undefined);
  revalidatePath("/", "layout");
}
const cat = z.string().max(40).optional().transform((v) => (v ? v : null));

export async function setBudgetAction(form: FormData): Promise<void> {
  const amount = parseMoney(form.get("amount"));
  const categoryId = cat.parse(form.get("categoryId") ?? undefined);
  if (amount == null) return;
  const ctx = await getContext();
  await ctx.write.setBudget(categoryId, amount, "user");
  await ctx.write.audit("budget.set", categoryId ?? "overall", { amount });
  await done();
}

export async function removeBudgetAction(form: FormData): Promise<void> {
  const categoryId = cat.parse(form.get("categoryId") ?? undefined);
  if (!categoryId) return;
  const ctx = await getContext();
  await ctx.write.setBudget(categoryId, 0, "user"); // 0 = no category budget
  await done();
}

/** Approve / modify / ignore — the user always decides; nothing changes silently. */
export async function resolveSuggestionAction(form: FormData): Promise<void> {
  const parsed = z.object({ id: z.string().uuid(), decision: z.enum(["approve", "modify", "ignore"]) }).safeParse({ id: form.get("id"), decision: form.get("decision") });
  if (!parsed.success) return;
  const ctx = await getContext();
  const sug = (await ctx.write.suggestions("pending")).find((s) => s.id === parsed.data.id);
  if (!sug) return;
  const payload = sug.payload as { suggested: number };
  if (parsed.data.decision === "ignore") await ctx.write.resolveSuggestion(sug.id, "ignored");
  else {
    const amount = parsed.data.decision === "approve" ? payload.suggested : parseMoney(form.get("amount"));
    if (amount == null) return;
    await ctx.write.setBudget(sug.categoryId ?? null, amount, "suggestion_approved");
    await ctx.write.resolveSuggestion(sug.id, parsed.data.decision === "approve" ? "approved" : "modified");
  }
  await ctx.write.audit("suggestion.resolved", sug.id, { decision: parsed.data.decision });
  await done();
}

const goalSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60),
  kind: z.enum(["monthly_saving", "emergency_fund", "vacation", "purchase", "investment"]),
  target: z.number().int().positive(), current: z.number().int().min(0),
  monthly: z.number().int().min(0).nullable(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export async function saveGoalAction(form: FormData): Promise<void> {
  const g = goalSchema.safeParse({
    id: form.get("id") || undefined, name: form.get("name"), kind: form.get("kind") || "savings",
    target: parseMoney(form.get("target")) ?? NaN, current: parseMoney(form.get("current") ?? "0") ?? 0,
    monthly: parseMoney(form.get("monthly")), date: form.get("date") ? String(form.get("date")) : null,
  });
  if (!g.success) return;
  const ctx = await getContext();
  await ctx.write.saveGoal({ id: g.data.id, name: g.data.name, kind: g.data.kind, target: g.data.target, current: g.data.current, monthlyContribution: g.data.monthly || null, targetDate: g.data.date });
  revalidatePath("/budgets");
}
export async function deleteGoalAction(form: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const ctx = await getContext();
  await ctx.write.deleteGoal(id.data);
  revalidatePath("/budgets");
}

const recSchema = z.object({ title: z.string().trim().min(1).max(60), amount: z.number().int().positive(), interval: z.enum(["weekly", "monthly", "bimonthly", "quarterly", "yearly"]), day: z.number().int().min(1).max(31) });
export async function addRecurringAction(form: FormData): Promise<void> {
  const r = recSchema.safeParse({ title: form.get("title"), amount: parseMoney(form.get("amount")) ?? NaN, interval: form.get("interval") || "monthly", day: Number(form.get("day")) || 1 });
  if (!r.success) return;
  const ctx = await getContext();
  const t = ctx.today;
  const dom = Math.min(r.data.day, 28);
  const thisMonth = `${t.slice(0, 7)}-${String(dom).padStart(2, "0")}`;
  const start = thisMonth >= t ? thisMonth : addMonths(thisMonth, 1);
  await ctx.write.addUserRecurring({
    merchantNormalized: r.data.title.toLowerCase(), title: r.data.title, amount: r.data.amount, interval: r.data.interval, dayOfMonth: dom,
    // first posting is the *next* due date; "lastSeen" is set to the previous period so nothing is double-counted
    nextExpected: start, lastSeen: addMonths(start, -1), active: true, consumptionType: "fixed", source: "user",
  });
  await postDueRecurring(ctx.write, ctx.today);
  await done();
}
export async function deleteRecurringAction(form: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const ctx = await getContext();
  await ctx.write.deleteRecurring(id.data);
  await done();
}

export { isKnownSub };
