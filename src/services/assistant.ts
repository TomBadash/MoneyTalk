import type { Agorot, IsoDate, Txn } from "@/domain/types";
import { QuerySpecSchema, type QuerySpec } from "@/ai/query-spec";
import { parseSearch, type TxnQuery } from "./search";
import { normalizeText } from "@/classify/normalize";
import { MERCHANTS, PRODUCTS } from "@/classify/dictionary";
import { CATS, SUBS, PARENTS, nodeInfo } from "@/classify/taxonomy";
import { isConsumption } from "@/engine/consumption";
import { productStats } from "@/engine/analytics";
import { detectRecurring, recurringAlerts } from "@/engine/recurring";
import { addMonths, diffDays, monthEnd, monthKey, monthStart } from "@/engine/period";
import { pctChange } from "@/engine/money";
import { resolvePeriod, comparePeriod, savingsByMonth, type Period, type Range } from "./analytics";
import type { DashboardPayload } from "./dashboard";

export type AnswerRow = { label: string; value: string; sub?: string };
export type Answer = {
  ok: boolean;
  text: string; // headline, Hebrew
  rows?: AnswerRow[];
  /** "Show Transactions": the exact filter behind the number. */
  query?: TxnQuery;
  spec?: QuerySpec;
};

const nis = (a: Agorot, exact = false) => `₪${(Math.abs(a) / 100).toLocaleString("he-IL", { maximumFractionDigits: exact ? 2 : 0 })}`;

/* ───────────── rule-based question → QuerySpec (covers the common questions without any AI call) ───────────── */

const QUESTION_WORDS = new Set(["כמה", "הוצאתי", "שילמתי", "הוצאנו", "שילמנו", "קניתי", "פעמים", "על", "ב", "את", "מה", "איפה", "אני", "של", "לי", "שלי", "כסף", "הכי", "הרבה", "בממוצע", "החודש", "השבוע", "השנה", "היום", "מתחילת", "שעבר", "שנה", "שעברה", "האחרונים", "האחרונות", "המוצרים", "הקטגוריות", "שלוש", "שקלתי", "קונה", "ש", "עלו", "עלה", "המחיר", "באילו", "מוצרים", "שאני", "ה", "מ", "זה", "יש", "נשאר", "להוציא", "צפוי", "לחסוך", "מנויים", "התייקרו", "קבועות", "ההוצאות", "הקבועות", "מוציא", "יותר", "מבשנה", "איזה", "מה", "הם", "כל"]);
const has = (q: string, ...ws: string[]) => ws.some((w) => q.includes(w));

function numberAfter(q: string, re: RegExp): number | null { const m = q.match(re); return m ? Number(m[1]) : null; }
const HE_NUM: Record<string, number> = { שלוש: 3, שלושה: 3, חמש: 5, חמישה: 5, עשר: 10, עשרה: 10 };

export function parseQuestion(question: string, today: IsoDate): QuerySpec | null {
  const q = normalizeText(question);
  const s = parseSearch(question, today);
  // split tokens like "ב-Wolt?" into words, drop a dangling Hebrew "in" prefix and question words
  const entities = (s.text ?? []).flatMap((w) => normalizeText(w).split(" ")).filter((w) => w && w !== "ב" && !QUESTION_WORDS.has(w) && !/^\d+$/.test(w));
  const limitDigit = numberAfter(q, /\b(\d{1,2})\s+(?:ה)?(?:מוצרים|קטגוריות|בתי|חיובים)/);
  const limitWord = Object.entries(HE_NUM).find(([w]) => q.includes(`${w} ${"הקטגוריות"}`) || q.includes(`${w} קטגוריות`))?.[1];
  const limit = limitDigit ?? limitWord ?? null;

  let period: QuerySpec["period"] = "month";
  if (s.from && s.to) period = "custom";
  else if (has(q, "השבוע")) period = "week";
  else if (has(q, "היום")) period = "today";
  else if (has(q, "החודש שעבר")) period = "last_month";
  else if (has(q, "שנה שעברה")) period = "last_year";
  else if (has(q, "השנה", "מתחילת השנה")) period = "ytd";
  else if (has(q, "החודש")) period = "month";
  else if (has(q, "ברבעון")) period = "quarter";
  else period = "all";

  const base = (metric: QuerySpec["metric"], over: Partial<QuerySpec> = {}): QuerySpec => ({
    metric, entities: [], period, from: s.from ?? null, to: s.to ?? null, compare: "none", limit, ...over,
  });

  if (has(q, "נשאר") && has(q, "שבוע")) return base("safe_to_spend_week", { period: "week" });
  if (has(q, "נשאר") && has(q, "להוציא")) return base("safe_to_spend_month", { period: "month" });
  if (has(q, "לחסוך") || has(q, "אחסוך")) return base("forecast_savings", { period: "month" });
  if (has(q, "שיעור החיסכון", "שיעור חיסכון")) return base("savings_rate");
  if (has(q, "מנויים") && has(q, "התייקרו", "התייקר", "עלו")) return base("subscription_changes", { period: "all" });
  if (has(q, "הוצאות הקבועות", "ההוצאות קבועות", "הקבועות שלי", "הוצאות קבועות")) return base("fixed_expenses", { period: "all" });
  if (has(q, "מוצרים") && has(q, "מחיר") && has(q, "עלה", "עלו", "התייקר")) return base("product_price_changes", { period: "all", limit: limit ?? 5 });
  if (has(q, "מוצרים") && has(q, "הכי הרבה", "הכי")) return base("top_products", { period: s.from ? "custom" : "all", limit: limit ?? 10 });
  if (has(q, "קטגוריות") && has(q, "עלו", "עלתה", "יותר")) return base("category_changes", { compare: "prev_period", period: "month", limit: limit ?? 3 });
  if (has(q, "איפה") && has(q, "מוציא יותר") ) return base("category_changes", { compare: "prev_year", period: has(q, "שנה שעברה") ? "ytd" : "month", limit: limit ?? 5 });
  if (has(q, "בתי עסק") && has(q, "הכי")) return base("top_merchants", { limit: limit ?? 5 });
  if (has(q, "כמה פעמים")) return entities.length ? base("count", { entities }) : null;
  if (has(q, "בממוצע")) return entities.length ? base("avg", { entities }) : null;
  if (has(q, "כמה") && has(q, "הוצאתי", "שילמתי", "הוצאנו", "שילמנו")) return base("sum", { entities });
  return null;
}

/* ───────────── entity resolution (local; the model never sees the user's product/merchant lists) ───────────── */

export type Entities = { categoryId?: string; merchant?: string; productId?: string };
export type ResolveCtx = { products: { id: string; name: string; normalized: string }[]; merchants: { name: string; normalized: string }[] };

const CAT_SYN: Record<string, string> = {
  מסעדות: "c_eating_out", מסעדה: "c_eating_out", אוכל: "c_eating_out", "אוכל בחוץ": "c_eating_out", בחוץ: "c_eating_out",
  בגדים: "s_clothing", ביגוד: "s_clothing", "בגדי": "s_clothing", אופנה: "c_shopping", קניות: "c_shopping",
  סופר: "c_groceries", מכולת: "c_groceries", "מזון": "c_groceries", משלוחים: "c_delivery", בילויים: "c_entertainment",
  דלק: "c_fuel", חניה: "c_parking", תחבורה: "p_transport", בית: "p_housing", דיור: "p_housing", בריאות: "p_health", ספורט: "c_sport",
  מנויים: "c_subscriptions", ברים: "c_bars", טיסות: "c_travel", נסיעות: "c_travel", אלקטרוניקה: "c_electronics",
};

export function resolveEntities(texts: string[], ctx: ResolveCtx): { resolved: Entities; unresolved: string[] } {
  const out: Entities = {}; const unresolved: string[] = [];
  for (const raw of texts) {
    const n = normalizeText(raw);
    if (!n) continue;
    // merchants first for brand names (Wolt/Zara/AM…): dictionary aliases and the user's own merchants
    const dm = MERCHANTS.find((m) => m.aliases.some((a) => normalizeText(a) === n) || normalizeText(m.name) === n);
    const um = ctx.merchants.find((m) => m.normalized === n || (dm && m.normalized === normalizeText(dm.name)));
    if (um || dm) { out.merchant = um?.normalized ?? normalizeText(dm!.name); continue; }
    // products (the user's own memory), exact or contained
    const prod = ctx.products.find((p) => p.normalized === n) ?? ctx.products.find((p) => p.normalized.includes(n) || n.includes(p.normalized));
    const dictProd = PRODUCTS.find((p) => p.keywords.some((k) => normalizeText(k) === n));
    const prodFromDict = dictProd ? ctx.products.find((p) => p.normalized === normalizeText(dictProd.name)) : undefined;
    const category = CAT_SYN[n] ?? [...SUBS, ...CATS, ...PARENTS].find((c) => normalizeText(c.he) === n)?.id;
    // "קפה" is both a product and a subcategory: prefer the product (more specific) when we have it
    if (prod ?? prodFromDict) { out.productId = (prod ?? prodFromDict)!.id; continue; }
    if (category) { out.categoryId = category; continue; }
    const loose = [...SUBS, ...CATS].find((c) => normalizeText(c.he).includes(n) && n.length >= 3);
    if (loose) { out.categoryId = loose.id; continue; }
    unresolved.push(raw);
  }
  return { resolved: out, unresolved };
}

/* ───────────── execution: every number comes from here ───────────── */

export type AssistantData = {
  today: IsoDate; txns: Txn[]; dashboard: DashboardPayload; resolve: ResolveCtx;
  productName: (id: string) => string;
};

const PERIOD_LABEL: Record<string, string> = { today: "היום", week: "השבוע", month: "החודש", last_month: "בחודש שעבר", quarter: "ברבעון", year: "ב-12 החודשים האחרונים", ytd: "מתחילת השנה", last_year: "בשנה שעברה", all: "בסך הכול" };

function periodOf(spec: QuerySpec, today: IsoDate): { from?: IsoDate; to?: IsoDate; label: string } {
  switch (spec.period) {
    case "today": return { from: today, to: today, label: PERIOD_LABEL.today };
    case "week": case "month": case "quarter": case "year": case "ytd": { const p = resolvePeriod(spec.period as Range, today); return { from: p.from, to: p.to, label: PERIOD_LABEL[spec.period] }; }
    case "last_month": { const s = addMonths(monthStart(today), -1); return { from: s, to: monthEnd(s), label: PERIOD_LABEL.last_month }; }
    case "last_year": { const y = Number(today.slice(0, 4)) - 1; return { from: `${y}-01-01`, to: `${y}-12-31`, label: PERIOD_LABEL.last_year }; }
    case "custom": return { from: spec.from ?? undefined, to: spec.to ?? undefined, label: spec.from && spec.to ? `בין ${spec.from.split("-").reverse().join("/")} ל-${spec.to.split("-").reverse().join("/")}` : "בתקופה שנבחרה" };
    default: return { label: PERIOD_LABEL.all };
  }
}

const entityName = (e: Entities, d: AssistantData) =>
  [e.productId ? d.productName(e.productId) : null, e.categoryId ? nodeInfo(e.categoryId).he : null, e.merchant ? d.txns.find((t) => t.merchantNormalized === e.merchant)?.merchantRaw ?? e.merchant : null].filter(Boolean).join(" ב");

const inCat = (t: Txn, id: string) => t.categoryId === id || t.subcategoryId === id || t.parentCategoryId === id;
const filt = (d: AssistantData, e: Entities, from?: IsoDate, to?: IsoDate) =>
  d.txns.filter((t) => isConsumption(t) && (!from || t.date >= from) && (!to || t.date <= to) &&
    (!e.categoryId || inCat(t, e.categoryId)) && (!e.merchant || t.merchantNormalized === e.merchant) && (!e.productId || t.productId === e.productId));

export function execute(specIn: QuerySpec, d: AssistantData): Answer {
  const spec = QuerySpecSchema.parse(specIn);
  const { today } = d;
  const per = periodOf(spec, today);
  const { resolved: e, unresolved } = resolveEntities(spec.entities, d.resolve);
  const q: TxnQuery = { from: per.from, to: per.to, categoryId: e.categoryId, merchant: e.merchant, productId: e.productId };
  const monthQ: TxnQuery = { from: monthStart(today), to: today };

  switch (spec.metric) {
    case "sum": case "count": case "avg": {
      if (unresolved.length && !Object.keys(e).length) return { ok: false, text: `לא מצאתי "${unresolved.join(", ")}" בעסקאות שלך. נסה שם של מוצר, בית עסק או קטגוריה.`, spec };
      const rows = filt(d, e, per.from, per.to);
      const total = rows.reduce((s, t) => s + t.amount, 0);
      const what = entityName(e, d) || "הכול";
      if (spec.metric === "count") return { ok: true, text: `קנית ${what} ${rows.length} פעמים ${per.label}.`, rows: [{ label: "סה״כ שולם", value: nis(total) }], query: q, spec };
      if (spec.metric === "avg") return rows.length ? { ok: true, text: `שילמת על ${what} בממוצע ${nis(Math.round(total / rows.length), true)} (${rows.length} קניות, ${per.label}).`, rows: [{ label: "סה״כ", value: nis(total) }, { label: "קניות", value: String(rows.length) }], query: q, spec } : { ok: true, text: `לא נמצאו קניות של ${what} ${per.label}.`, query: q, spec };
      return { ok: true, text: rows.length ? `הוצאת ${nis(total)} על ${what === "הכול" ? "הכול" : what} ${per.label}.` : `לא נמצאו הוצאות על ${what} ${per.label}.`, rows: rows.length ? [{ label: "עסקאות", value: String(rows.length) }, { label: "ממוצע לעסקה", value: nis(Math.round(total / rows.length), true) }] : undefined, query: q, spec };
    }
    case "top_products": {
      const rows = productStats(filt(d, e, per.from, per.to)).sort((a, b) => b.count - a.count || b.total - a.total).slice(0, spec.limit ?? 10);
      return { ok: true, text: `${rows.length} המוצרים שאתה קונה הכי הרבה ${per.label === PERIOD_LABEL.all ? "" : per.label}:`.replace(/\s+:/, ":"), rows: rows.map((r) => ({ label: d.productName(r.productId), value: `${r.count} קניות`, sub: `${nis(r.total)} · ממוצע ${nis(r.avg, true)}` })), query: q, spec };
    }
    case "top_merchants": {
      const m = new Map<string, { name: string; total: number; n: number }>();
      filt(d, e, per.from, per.to).forEach((t) => { const x = m.get(t.merchantNormalized) ?? { name: t.merchantRaw, total: 0, n: 0 }; x.total += t.amount; x.n++; m.set(t.merchantNormalized, x); });
      const rows = [...m.values()].sort((a, b) => b.total - a.total).slice(0, spec.limit ?? 5);
      return { ok: true, text: `בתי העסק שהוצאת בהם הכי הרבה ${per.label}:`, rows: rows.map((r) => ({ label: r.name, value: nis(r.total), sub: `${r.n} עסקאות` })), query: q, spec };
    }
    case "top_categories": case "category_changes": {
      const cur = resolvePeriod(spec.period === "all" ? "month" : (spec.period === "custom" ? "custom" : spec.period === "last_month" || spec.period === "last_year" ? "month" : spec.period) as Range, today, per.from, per.to);
      const period: Period = per.from && per.to ? { range: "custom", from: per.from, to: per.to } : cur;
      const prev = comparePeriod(period, spec.compare === "prev_year" ? "year" : "month");
      const sumBy = (from: string, to: string) => { const m = new Map<string, number>(); filt(d, {}, from, to).forEach((t) => t.categoryId && m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount)); return m; };
      const a = sumBy(period.from, period.to), b = sumBy(prev.from, prev.to);
      const rows = [...new Set([...a.keys(), ...b.keys()])].map((id) => ({ id, delta: (a.get(id) ?? 0) - (b.get(id) ?? 0), cur: a.get(id) ?? 0, prev: b.get(id) ?? 0 }))
        .filter((r) => r.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, spec.limit ?? 3);
      const vs = spec.compare === "prev_year" ? "אשתקד" : "לעומת התקופה המקבילה הקודמת";
      return { ok: true, text: rows.length ? `הקטגוריות שעלו הכי הרבה ${vs}:` : `לא נמצאו קטגוריות שעלו ${vs}.`, rows: rows.map((r) => ({ label: nodeInfo(r.id).he, value: `+${nis(r.delta)}`, sub: `${nis(r.cur)} במקום ${nis(r.prev)}${r.prev > 0 ? ` (${Math.round((pctChange(r.cur, r.prev) ?? 0) * 100)}%+)` : ""}` })), query: { from: period.from, to: period.to }, spec };
    }
    case "product_price_changes": {
      const rows = productStats(d.txns).filter((s) => s.priceChange != null && s.count >= 4).sort((a, b) => b.priceChange! - a.priceChange!).slice(0, spec.limit ?? 5);
      return { ok: true, text: rows.length ? "המוצרים שהמחיר שלהם עלה הכי הרבה:" : "אין עדיין מספיק קניות חוזרות כדי לזהות שינויי מחיר.", rows: rows.map((r) => ({ label: d.productName(r.productId), value: `${r.priceChange! > 0 ? "+" : ""}${Math.round(r.priceChange! * 100)}%`, sub: `ממוצע ${nis(r.avg, true)} · אחרון ${nis(r.last, true)}` })), query: rows[0] ? { productId: rows[0].productId } : undefined, spec };
    }
    case "safe_to_spend_week": return { ok: true, text: d.dashboard.remainingWeek >= 0 ? `נשאר לך להוציא השבוע ${nis(d.dashboard.remainingWeek)}.` : `חרגת השבוע ב-${nis(d.dashboard.remainingWeek)} — נאזן בהמשך החודש.`, rows: [{ label: "היום אפשר", value: nis(d.dashboard.todayAllowance) }], query: { from: monthStart(today), to: today }, spec };
    case "safe_to_spend_month": return { ok: true, text: d.dashboard.remainingMonth >= 0 ? `נשאר לך להוציא החודש ${nis(d.dashboard.remainingMonth)} (מתוך יעד ${nis(d.dashboard.monthTarget)}).` : `חרגת מהיעד החודשי ב-${nis(d.dashboard.remainingMonth)}.`, query: monthQ, spec };
    case "forecast_savings": return { ok: true, text: `אתה צפוי לחסוך החודש כ-${nis(d.dashboard.forecast.savings)} (${Math.round(d.dashboard.forecast.savingsRate * 100)}% מההכנסה).`, rows: [{ label: "ביטחון בתחזית", value: { high: "גבוה", medium: "בינוני", low: "נמוך" }[d.dashboard.forecast.confidence] }, { label: "הוצאות צפויות", value: nis(d.dashboard.forecast.totalSpending) }], query: monthQ, spec };
    case "savings_rate": {
      const m = savingsByMonth(d.txns, monthKey(addMonths(monthStart(today), -1)), 1)[0];
      return m.income > 0 ? { ok: true, text: `שיעור החיסכון שלך בחודש שעבר היה ${Math.round(m.rate * 100)}% (חסכת ${nis(m.saved)} מתוך הכנסה של ${nis(m.income)}).`, rows: m.invested ? [{ label: "הושקע/נחסך בנפרד", value: nis(m.invested) }] : undefined, query: { from: `${m.key}-01`, to: `${m.key}-31` }, spec } : { ok: false, text: "אין נתוני הכנסה לחודש שעבר.", spec };
    }
    case "fixed_expenses": {
      const rules = detectRecurring(d.txns, today).filter((r) => r.active && (r.consumptionType === "fixed" || r.consumptionType == null)).sort((a, b) => b.amount - a.amount);
      return { ok: true, text: `ההוצאות הקבועות שלך (${rules.length}):`, rows: rules.map((r) => ({ label: r.title, value: nis(r.amount, r.amount % 100 !== 0), sub: { weekly: "שבועי", monthly: "חודשי", bimonthly: "דו-חודשי", quarterly: "רבעוני", yearly: "שנתי" }[r.interval] })), query: { text: undefined }, spec };
    }
    case "subscription_changes": {
      const alerts = recurringAlerts(d.txns, detectRecurring(d.txns, today), today).filter((a) => a.kind === "price_increase");
      return { ok: true, text: alerts.length ? "המנויים שהתייקרו:" : "אף מנוי לא התייקר לאחרונה.", rows: alerts.map((a) => a.kind === "price_increase" ? { label: a.merchant, value: `+${nis(a.to - a.from, true)}`, sub: `${nis(a.from, true)} ← ${nis(a.to, true)}` } : { label: "", value: "" }), spec };
    }
  }
}

export { diffDays };
