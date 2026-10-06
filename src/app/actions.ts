"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { quickAdd } from "@/services/ingest";
import { approveClassification, correctTransaction } from "@/services/correct";
import { refreshSnapshot } from "@/services/refresh";
import { resolveSub, isKnownSub } from "@/classify/taxonomy";
import type { Txn } from "@/domain/types";

export type QuickAddSummary = {
  id: string; description: string; amount: number; // agorot
  merchant: string | null; path: string; // "מזון לבית › דגים"
  confidence: number; band: "auto" | "ai" | "review";
  reason: string; subcategoryId: string;
};
export type QuickAddResponse = { ok: true; summary: QuickAddSummary } | { ok: false; error: string };

const bandOf = (c: number) => (c >= 0.9 ? "auto" : c >= 0.7 ? "ai" : "review") as QuickAddSummary["band"];

function summarise(t: Txn): QuickAddSummary {
  const r = resolveSub(t.subcategoryId ?? "s_uncategorized");
  return {
    id: t.id, description: t.descriptionRaw, amount: t.amount, merchant: t.merchantNormalized && t.sourceProvider !== "manual" ? t.merchantRaw : null,
    path: `${r.categoryHe} › ${r.subHe}`, confidence: t.aiConfidence ?? 0, band: bandOf(t.aiConfidence ?? 0),
    reason: t.aiReasoningSummary ?? "", subcategoryId: r.subcategoryId,
  };
}

async function after(): Promise<void> {
  const ctx = await getContext();
  await refreshSnapshot(ctx.write, ctx.today).catch(() => undefined);
  revalidatePath("/", "layout");
}

const textSchema = z.string().trim().min(1, "מה קנית?").max(200, "הטקסט ארוך מדי");

export async function quickAddAction(text: string): Promise<QuickAddResponse> {
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const ctx = await getContext();
    const r = await quickAdd(ctx.write, parsed.data, ctx.today);
    if (!r.ok) return r;
    await ctx.write.audit("transaction.quick_add", r.created.txn.id);
    await after();
    return { ok: true, summary: summarise(r.created.txn) };
  } catch {
    return { ok: false, error: "לא הצלחנו לשמור כרגע. ההוצאה לא אבדה — נסה שוב בעוד רגע." };
  }
}

export async function undoAction(id: string): Promise<{ ok: boolean }> {
  z.string().uuid().parse(id);
  const ctx = await getContext();
  await ctx.write.softDeleteTxn(id);
  await after();
  return { ok: true };
}

export async function restoreAction(id: string): Promise<{ ok: boolean }> {
  z.string().uuid().parse(id);
  const ctx = await getContext();
  await ctx.write.restoreTxn(id);
  await after();
  return { ok: true };
}

export async function correctAction(id: string, subcategoryId: string): Promise<QuickAddResponse> {
  z.string().uuid().parse(id);
  if (!isKnownSub(subcategoryId)) return { ok: false, error: "קטגוריה לא מוכרת." };
  const ctx = await getContext();
  await correctTransaction(ctx.write, id, subcategoryId, ctx.today);
  await after();
  const t = await ctx.write.txn(id);
  return t ? { ok: true, summary: summarise(t) } : { ok: false, error: "העסקה לא נמצאה." };
}

export async function approveAction(id: string): Promise<{ ok: boolean }> {
  z.string().uuid().parse(id);
  const ctx = await getContext();
  await approveClassification(ctx.write, id);
  await after();
  return { ok: true };
}

import { getAiProvider } from "@/ai";
import { parseQuestion, execute, type Answer } from "@/services/assistant";
import { QuerySpecSchema } from "@/ai/query-spec";
import { getDashboard } from "@/services/dashboard";
import { rateLimit } from "@/lib/rate-limit";

export async function askAction(question: string): Promise<Answer> {
  const text = z.string().trim().min(2).max(300).safeParse(question);
  if (!text.success) return { ok: false, text: "כתוב שאלה קצרה, למשל: כמה הוצאתי על קפה השנה?" };
  const ctx = await getContext();
  if (!rateLimit(`ask:${ctx.userId ?? "local"}`, 30)) return { ok: false, text: "שאלות רבות בזמן קצר — נסה שוב בעוד דקה." };

  const [txns, products, merchants, dashboard] = await Promise.all([ctx.read.txns(), ctx.read.products(), ctx.read.merchants(), getDashboard(ctx.read, ctx.today, ctx.demo)]);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const data = { today: ctx.today, txns, dashboard, resolve: { products, merchants }, productName: (id: string) => names.get(id) ?? "מוצר" };

  // 1) deterministic rules first (free, instant); 2) the model only translates words → a validated QuerySpec
  let spec = parseQuestion(text.data, ctx.today);
  if (!spec) {
    const ai = getAiProvider();
    spec = ai.available ? await ai.toQuerySpec(text.data, ctx.today) : null;
  }
  if (!spec) return { ok: false, text: "לא הצלחתי להבין את השאלה. נסה למשל: ״כמה הוצאתי על קפה השנה?״, ״מה המוצרים שאני קונה הכי הרבה?״ או ״כמה נשאר לי להוציא השבוע?״" };
  const valid = QuerySpecSchema.safeParse(spec);
  if (!valid.success) return { ok: false, text: "לא הצלחתי להבין את השאלה. נסה לנסח אחרת." };
  return execute(valid.data, data);
}
