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
