import type { Agorot, IsoDate, Txn } from "@/domain/types";
import { isConsumption, isVariable } from "./consumption";
import { addDays, addMonths, diffDays, monthKey, monthStart, weekStart } from "./period";
import type { RecurringAlert } from "./recurring";
import type { Forecast } from "./forecast";

export type Insight = {
  id: string;
  kind: "forecast" | "category" | "weekly" | "recurring";
  tone: "good" | "neutral" | "attention";
  text: string; // Hebrew, ready to show
  impact: Agorot; // absolute ₪ effect, used for ranking
  link?: string;
};

const MIN_IMPACT = 10_000; // ₪100 — below this an insight is noise

const nis = (a: Agorot) => `₪${Math.round(Math.abs(a) / 100).toLocaleString("he-IL")}`;
const nisExact = (a: Agorot) => `₪${(Math.abs(a) / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;

export type InsightInput = {
  today: IsoDate;
  txns: Txn[]; // ≥ 4 months of history helps
  forecast: Forecast;
  variableTarget: Agorot;
  alerts: RecurringAlert[];
  categoryName: (id: string) => string;
};

/**
 * Candidate insights with a deterministic ₪-impact score; the caller shows the top three.
 * Interpretation over counting: every text states a direction and a ₪/% effect.
 */
export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { today } = i;
  const dayOfMonth = Number(today.slice(8, 10));

  // 1) Month-end outlook
  const v = i.forecast.budgetVariance;
  if (i.forecast.confidence !== "low" && Math.abs(v) >= MIN_IMPACT) {
    out.push({
      id: "forecast", kind: "forecast", tone: v > 0 ? "attention" : "good", impact: Math.abs(v) * 1.2,
      text: v > 0 ? `אם תמשיך בקצב הנוכחי, תסיים את החודש ב-${nis(v)} מעל היעד.` : `בקצב הנוכחי תסיים את החודש ${nis(v)} מתחת ליעד.`,
    });
  }

  // 2) Category vs. your own average over the same part of the month
  const thisStart = monthStart(today);
  const byCat = new Map<string, { now: Agorot; prev: Agorot[] }>();
  const slot = (c: string) => byCat.get(c) ?? byCat.set(c, { now: 0, prev: [0, 0, 0] }).get(c)!;
  for (const t of i.txns) {
    if (!isVariable(t) || !t.categoryId) continue;
    const d = Number(t.date.slice(8, 10));
    if (t.date >= thisStart && t.date <= today) slot(t.categoryId).now += t.amount;
    else for (let k = 1; k <= 3; k++) {
      const ms = addMonths(thisStart, -k);
      if (monthKey(t.date) === monthKey(ms) && d <= dayOfMonth) slot(t.categoryId).prev[k - 1] += t.amount;
    }
  }
  if (dayOfMonth >= 7) {
    for (const [cat, s] of byCat) {
      const avg = s.prev.reduce((a, b) => a + b, 0) / 3;
      const delta = s.now - avg;
      if (avg < 20_000 || Math.abs(delta) < MIN_IMPACT) continue;
      const pct = Math.round((delta / avg) * 100);
      if (Math.abs(pct) < 15) continue;
      const name = i.categoryName(cat);
      out.push({
        id: `cat:${cat}`, kind: "category", tone: delta > 0 ? "attention" : "good", impact: Math.abs(delta), link: `/transactions?category=${cat}`,
        text: delta > 0 ? `${name} גבוהות ב-${pct}% מהממוצע שלך (${nis(delta)} יותר עד עכשיו).` : `${name} נמוכות ב-${Math.abs(pct)}% מהממוצע שלך — חסכת ${nis(delta)}.`,
      });
    }
  }

  // 3) This week vs the trailing 8 weeks (same days elapsed)
  const ws = weekStart(today);
  const elapsed = diffDays(today, ws);
  const weekNow = i.txns.filter((t) => isVariable(t) && t.date >= ws && t.date <= today).reduce((s, t) => s + t.amount, 0);
  let sum = 0, n = 0;
  for (let k = 1; k <= 8; k++) {
    const from = addDays(ws, -7 * k);
    const to = addDays(from, elapsed);
    const w = i.txns.filter((t) => isVariable(t) && t.date >= from && t.date <= to);
    if (w.length) { sum += w.reduce((s, t) => s + t.amount, 0); n++; }
  }
  if (n >= 4 && elapsed >= 2) {
    const avg = sum / n, delta = weekNow - avg;
    if (Math.abs(delta) >= MIN_IMPACT * 1.5) {
      out.push({
        id: "weekly", kind: "weekly", tone: delta > 0 ? "attention" : "good", impact: Math.abs(delta) * 0.8,
        text: delta > 0 ? `ההוצאה השבועית שלך גבוהה ב-${nis(delta)} מהממוצע של 8 השבועות האחרונים.` : `ההוצאה השבועית שלך נמוכה ב-${nis(delta)} מהממוצע של 8 השבועות האחרונים.`,
      });
    }
  }

  // 4) Recurring changes — always high-signal
  for (const a of i.alerts) {
    if (a.kind === "price_increase") {
      out.push({ id: `rec:up:${a.merchant}`, kind: "recurring", tone: "attention", impact: (a.to - a.from) * 12 + 5_000, link: "/recurring",
        text: `${a.merchant} התייקר ב-${nisExact(a.to - a.from)} (${nisExact(a.from)} ← ${nisExact(a.to)}).` });
    } else if (a.kind === "new") {
      out.push({ id: `rec:new:${a.merchant}`, kind: "recurring", tone: "neutral", impact: a.amount * 6 + 4_000, link: "/recurring",
        text: `זיהינו חיוב חוזר חדש: ${a.merchant} (${nisExact(a.amount)}).` });
    } else if (a.kind === "disappeared") {
      out.push({ id: `rec:gone:${a.merchant}`, kind: "recurring", tone: "neutral", impact: 6_000, link: "/recurring",
        text: `${a.merchant} לא חויב לאחרונה — ייתכן שהמנוי בוטל.` });
    } else if (a.kind === "duplicate") {
      out.push({ id: `rec:dup:${a.merchant}`, kind: "recurring", tone: "attention", impact: a.amount + 8_000, link: "/recurring",
        text: `${a.merchant} חויב פעמיים באותו חודש (${nisExact(a.amount)}).` });
    } else {
      out.push({ id: `rec:odd:${a.merchant}`, kind: "recurring", tone: "attention", impact: a.amount - a.typical, link: "/recurring",
        text: `חיוב חריג ב-${a.merchant}: ${nisExact(a.amount)} לעומת ${nisExact(a.typical)} בדרך כלל.` });
    }
  }

  return out.filter((x) => x.impact >= MIN_IMPACT / 2).sort((a, b) => b.impact - a.impact);
}

/** Top three, never more than one insight per kind-slot twice in a row (keeps the list varied). */
export function topInsights(all: Insight[], n = 3): Insight[] {
  const out: Insight[] = [];
  const perKind = new Map<string, number>();
  for (const x of all) {
    const c = perKind.get(x.kind) ?? 0;
    if (c >= 2) continue;
    out.push(x); perKind.set(x.kind, c + 1);
    if (out.length === n) break;
  }
  return out;
}

export { isConsumption };
