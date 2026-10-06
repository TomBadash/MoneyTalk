import type { Agorot, IsoDate, Txn } from "@/domain/types";
import { isConsumption } from "@/engine/consumption";
import { purchaseBasisAmount } from "@/engine/installments";
import { pctChange } from "@/engine/money";
import { addDays, addMonths, diffDays, eachDay, monthEnd, monthKey, monthStart, weekStart } from "@/engine/period";
import { nodeInfo } from "@/classify/taxonomy";

export type Range = "week" | "month" | "quarter" | "half" | "year" | "ytd" | "custom";
export type Compare = "prev" | "month" | "quarter" | "year";
export type Basis = "cash" | "purchase";
export const RANGES: Record<Range, string> = { week: "שבוע", month: "חודש", quarter: "רבעון", half: "חצי שנה", year: "שנה", ytd: "מתחילת השנה", custom: "מותאם" };
export const COMPARES: Record<Compare, string> = { prev: "לתקופה הקודמת", month: "לחודש הקודם", quarter: "לרבעון הקודם", year: "לשנה שעברה" };

export type Period = { from: IsoDate; to: IsoDate; range: Range };

export function resolvePeriod(range: Range, today: IsoDate, from?: IsoDate, to?: IsoDate): Period {
  const y = today.slice(0, 4), m = Number(today.slice(5, 7));
  switch (range) {
    case "week": return { range, from: weekStart(today), to: today };
    case "month": return { range, from: monthStart(today), to: today };
    case "quarter": return { range, from: `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`, to: today };
    case "half": return { range, from: `${y}-${m <= 6 ? "01" : "07"}-01`, to: today };
    case "year": return { range, from: addDays(addMonths(today, -12), 1), to: today };
    case "ytd": return { range, from: `${y}-01-01`, to: today };
    case "custom": {
      const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : monthStart(today);
      const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
      return f <= t ? { range, from: f, to: t } : { range, from: t, to: f };
    }
  }
}

/** The comparison window. "prev" = same length immediately before; others shift by calendar units. */
export function comparePeriod(p: Period, how: Compare): { from: IsoDate; to: IsoDate } {
  if (how === "prev") { const len = diffDays(p.to, p.from) + 1; return { from: addDays(p.from, -len), to: addDays(p.from, -1) }; }
  const shift = how === "month" ? -1 : how === "quarter" ? -3 : -12;
  const from = addMonths(p.from, shift);
  // a partial current period compares like-for-like days (1..N of the previous month), not the full month
  const to = p.to === monthEnd(p.to) ? monthEnd(addMonths(p.to, shift)) : addMonths(p.to, shift);
  return { from, to };
}

export type Drill = { cat?: string; merchant?: string; product?: string };

const withBasis = (ts: Txn[], basis: Basis): Txn[] =>
  basis === "cash" ? ts : ts.map((t) => ({ ...t, amount: purchaseBasisAmount(t) })).filter((t) => t.amount > 0);

const inCat = (t: Txn, id: string) => t.categoryId === id || t.subcategoryId === id || t.parentCategoryId === id;

export function applyDrill(ts: Txn[], d: Drill): Txn[] {
  return ts.filter((t) => (!d.cat || inCat(t, d.cat)) && (!d.merchant || t.merchantNormalized === d.merchant) && (!d.product || t.productId === d.product));
}

export type Row = { key: string; label: string; value: Agorot; count: number; color?: string };
export type Bucket = { key: string; label: string; fixed: Agorot; variable: Agorot; oneOff: Agorot; total: Agorot };

const sumBy = (ts: Txn[], keyOf: (t: Txn) => string | null | undefined, label: (k: string) => string, color?: (k: string) => string | undefined): Row[] => {
  const m = new Map<string, Row>();
  for (const t of ts) {
    const k = keyOf(t);
    if (!k) continue;
    const r = m.get(k) ?? { key: k, label: label(k), value: 0, count: 0, color: color?.(k) };
    r.value += t.amount; r.count++;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
};

/** Which level of the taxonomy to break down given the current drill. */
function levelKey(cat?: string): (t: Txn) => string | null | undefined {
  if (!cat) return (t) => t.categoryId; // top level: categories
  const n = nodeInfo(cat);
  if (n.parentId == null) return (t) => t.categoryId; // a parent → its categories
  return (t) => t.subcategoryId; // a category → its subcategories
}

export type Analysis = {
  period: Period; prev: { from: IsoDate; to: IsoDate } | null;
  total: Agorot; prevTotal: Agorot | null; change: number | null; count: number;
  buckets: Bucket[]; granularity: "day" | "week" | "month";
  categories: Row[]; merchants: Row[]; products: Row[];
  split: { fixed: Agorot; variable: Agorot; oneOff: Agorot };
  essential: { essential: Agorot; lifestyle: Agorot; oneOff: Agorot };
  recurring: Agorot;
  compareUnavailable: boolean; // previous window not sufficiently covered by history
  matching: Txn[]; // consumption in the period after drill filters (for the drill list)
};

export function analyze(all: Txn[], opts: { period: Period; compare: Compare | null; basis: Basis; drill: Drill; productName: (id: string) => string }): Analysis {
  const { period, drill } = opts;
  const base = withBasis(all.filter(isConsumption), opts.basis);
  const scoped = applyDrill(base, drill);
  const cur = scoped.filter((t) => t.date >= period.from && t.date <= period.to);
  const prev = opts.compare ? comparePeriod(period, opts.compare) : null;
  // Only compare when history covers ≥70% of the earlier window; otherwise the % change would be misleading.
  const earliest = all.reduce<string | null>((e, t) => (e == null || t.date < e ? t.date : e), null);
  let compareUnavailable = false;
  if (prev && earliest) {
    const len = diffDays(prev.to, prev.from) + 1;
    const covered = Math.max(0, diffDays(prev.to, earliest < prev.from ? prev.from : earliest) + 1);
    compareUnavailable = covered / len < 0.7;
  }
  const prevRows = prev && !compareUnavailable ? scoped.filter((t) => t.date >= prev.from && t.date <= prev.to) : null;
  const total = cur.reduce((s, t) => s + t.amount, 0);
  const prevTotal = prevRows ? prevRows.reduce((s, t) => s + t.amount, 0) : null;

  const span = diffDays(period.to, period.from) + 1;
  const granularity = span <= 35 ? "day" : span <= 120 ? "week" : "month";
  const bucketOf = (d: IsoDate) => (granularity === "day" ? d : granularity === "week" ? weekStart(d) : monthKey(d));
  const keys = granularity === "month"
    ? [...new Set(eachDay(period.from, period.to).map(monthKey))]
    : granularity === "week" ? [...new Set(eachDay(period.from, period.to).map(weekStart))] : eachDay(period.from, period.to);
  const bm = new Map<string, Bucket>(keys.map((k) => [k, { key: k, label: granularity === "month" ? k.slice(5) : `${k.slice(8)}/${k.slice(5, 7)}`, fixed: 0, variable: 0, oneOff: 0, total: 0 }]));
  const split = { fixed: 0, variable: 0, oneOff: 0 };
  const ess = { essential: 0, lifestyle: 0, oneOff: 0 };
  let recurring = 0;
  for (const t of cur) {
    const b = bm.get(bucketOf(t.date));
    const k = t.consumptionType === "fixed" ? "fixed" : t.consumptionType === "one_off" ? "oneOff" : "variable";
    if (b) { b[k] += t.amount; b.total += t.amount; }
    split[k] += t.amount;
    if (t.consumptionType === "lifestyle") ess.lifestyle += t.amount; else if (t.consumptionType === "one_off") ess.oneOff += t.amount; else ess.essential += t.amount;
    if (t.recurringStatus === "recurring" || t.consumptionType === "fixed") recurring += t.amount;
  }

  return {
    period, prev, total, prevTotal, change: prevTotal == null ? null : pctChange(total, prevTotal), count: cur.length,
    buckets: [...bm.values()], granularity,
    categories: sumBy(cur, levelKey(drill.cat), (k) => nodeInfo(k).he, (k) => nodeInfo(k).color),
    merchants: sumBy(cur, (t) => t.merchantNormalized, (k) => cur.find((t) => t.merchantNormalized === k)?.merchantRaw || k).slice(0, 8),
    products: sumBy(cur, (t) => t.productId, (k) => opts.productName(k)).slice(0, 8),
    split, essential: ess, recurring, compareUnavailable, matching: cur,
  };
}

export type SavingsMonth = { key: string; income: Agorot; spent: Agorot; invested: Agorot; saved: Agorot; rate: number };
/** Savings = income − consumption (cash basis). Investments/savings transfers are shown separately, never as spending. */
export function savingsByMonth(all: Txn[], endMonth: string, months: number): SavingsMonth[] {
  const out: SavingsMonth[] = [];
  const [y, m] = endMonth.split("-").map(Number);
  for (let k = months - 1; k >= 0; k--) {
    const key = new Date(Date.UTC(y, m - 1 - k, 1)).toISOString().slice(0, 7);
    let income = 0, spent = 0, invested = 0;
    for (const t of all) {
      if (t.date.slice(0, 7) !== key) continue;
      if (t.financialType === "income") income += t.amount;
      else if (isConsumption(t)) spent += t.amount;
      else if (t.financialType === "investment" || t.financialType === "savings") invested += t.amount;
    }
    out.push({ key, income, spent, invested, saved: income - spent, rate: income > 0 ? (income - spent) / income : 0 });
  }
  return out;
}
