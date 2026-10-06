import Link from "next/link";
import { getContext } from "@/lib/context";
import { analyze, resolvePeriod, savingsByMonth, RANGES, COMPARES, type Range, type Compare, type Basis } from "@/services/analytics";
import { Bars, HBars } from "@/components/charts";
import { TxnRow } from "@/components/txn-row";
import { formatAgorot, formatIso, formatPercent, formatSignedPercent } from "@/lib/format";
import { nodeInfo } from "@/classify/taxonomy";
import { monthKey } from "@/engine/period";
import { hrefFor } from "@/services/search";

export const metadata = { title: "ניתוח — MoneyTalk" };
type SP = Record<string, string | undefined>;

export default async function Analytics({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const range = (sp.range && sp.range in RANGES ? sp.range : "month") as Range;
  const compare = (sp.cmp === "none" ? null : sp.cmp && sp.cmp in COMPARES ? sp.cmp : "prev") as Compare | null;
  const basis = (sp.basis === "purchase" ? "purchase" : "cash") as Basis;
  const drill = { cat: sp.cat, merchant: sp.merchant, product: sp.product };
  const period = resolvePeriod(range, ctx.today, sp.from, sp.to);

  const [all, products] = await Promise.all([ctx.read.txns(), ctx.read.products()]);
  const pname = new Map(products.map((p) => [p.id, p.name]));
  const a = analyze(all, { period, compare, basis, drill, productName: (id) => pname.get(id) ?? "מוצר" });
  const savings = savingsByMonth(all, monthKey(ctx.today), 6);

  const u = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged: SP = { range: range === "month" ? undefined : range, cmp: compare === "prev" ? undefined : compare ?? "none", basis: basis === "cash" ? undefined : basis, from: sp.from, to: sp.to, cat: sp.cat, merchant: sp.merchant, product: sp.product, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/analytics?${s}` : "/analytics";
  };

  const crumbs: { label: string; href: string }[] = [];
  if (drill.cat) crumbs.push({ label: nodeInfo(drill.cat).he, href: u({ cat: undefined }) });
  if (drill.merchant) crumbs.push({ label: a.matching[0]?.merchantRaw ?? drill.merchant, href: u({ merchant: undefined }) });
  if (drill.product) crumbs.push({ label: pname.get(drill.product) ?? "מוצר", href: u({ product: undefined }) });
  // go up one level in the taxonomy
  const upCat = drill.cat ? nodeInfo(drill.cat).parentId : null;

  const stackedColors = [{ c: "var(--ink-3)", n: "קבועות" }, { c: "var(--accent)", n: "משתנות" }, { c: "var(--warning)", n: "חד-פעמיות" }];
  const total = a.total || 1;
  const listQuery = { from: period.from, to: period.to, categoryId: drill.cat, merchant: drill.merchant, productId: drill.product };

  return (
    <div className="stack-col">
      <h1 className="ttl">ניתוח</h1>

      <div className="chips" role="group" aria-label="טווח זמן">
        {(Object.keys(RANGES) as Range[]).filter((r) => r !== "custom").map((r) => <Link key={r} href={u({ range: r === "month" ? undefined : r, from: undefined, to: undefined })} className={`chip ${r === range ? "active" : ""}`} aria-current={r === range ? "true" : undefined}>{RANGES[r]}</Link>)}
      </div>
      <form className="inline-form" action="/analytics" aria-label="טווח מותאם">
        <input type="hidden" name="range" value="custom" />
        {drill.cat && <input type="hidden" name="cat" value={drill.cat} />}
        <div className="field"><label className="muted tiny" htmlFor="a-f">מתאריך</label><input id="a-f" name="from" type="date" className="input" defaultValue={period.from} /></div>
        <div className="field"><label className="muted tiny" htmlFor="a-t">עד תאריך</label><input id="a-t" name="to" type="date" className="input" defaultValue={period.to} /></div>
        <button className="btn ghost">החל</button>
      </form>
      <div className="chips" role="group" aria-label="השוואה ובסיס">
        {([...Object.keys(COMPARES), "none"] as (Compare | "none")[]).map((c) => <Link key={c} href={u({ cmp: c === "prev" ? undefined : c })} className={`chip ${(compare ?? "none") === c ? "active accent" : ""}`}>{c === "none" ? "ללא השוואה" : `ביחס ${COMPARES[c]}`}</Link>)}
        <Link href={u({ basis: basis === "cash" ? "purchase" : undefined })} className="chip" title="תזרים: לפי חיוב בפועל. רכישה: כל העסקה בתאריך הקנייה">{basis === "cash" ? "בסיס: תזרים ↔ רכישה" : "בסיס: רכישה ↔ תזרים"}</Link>
      </div>

      {crumbs.length > 0 && (
        <nav className="chips" aria-label="מסלול פירוט">
          <Link href="/analytics" className="chip">הכול</Link>
          {upCat && <Link href={u({ cat: upCat })} className="chip">‹ למעלה</Link>}
          {crumbs.map((c) => <Link key={c.label} href={c.href} className="chip active">{c.label} ✕</Link>)}
        </nav>
      )}

      <section className="card">
        <div className="muted tiny">{formatIso(period.from)} – {formatIso(period.to)} · {a.count} עסקאות · בסיס {basis === "cash" ? "תזרים" : "רכישה"}</div>
        <div className="row" style={{ marginTop: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          <div className="big-amt tnum">{formatAgorot(a.total)}</div>
          {a.compareUnavailable && <span className="muted tiny">אין מספיק היסטוריה להשוואה {COMPARES[compare!]}</span>}
          {a.change != null && <span className={`status ${a.change > 0.1 ? "warn" : "good"}`}>{formatSignedPercent(a.change)} {COMPARES[compare!]} ({formatAgorot(a.prevTotal ?? 0)})</span>}
        </div>
        <div style={{ marginTop: 16 }}>
          <Bars data={a.buckets.map((b) => ({ key: b.key, label: b.label, parts: [{ value: b.fixed, color: stackedColors[0].c, name: "קבועות" }, { value: b.variable, color: stackedColors[1].c, name: "משתנות" }, { value: b.oneOff, color: stackedColors[2].c, name: "חד-פעמיות" }] }))} height={170} unit={(v) => (v >= 100_000 ? `₪${Math.round(v / 10_000) / 10}K` : formatAgorot(v))} />
        </div>
        <div className="legend-inline">{stackedColors.map((s) => <span key={s.n}><i className="ln" style={{ borderTopColor: s.c }} />{s.n}</span>)}</div>
      </section>

      <div className="two-col">
        <section className="card"><h2 className="h3">{drill.cat && nodeInfo(drill.cat).parentId != null ? "תתי-קטגוריות" : "קטגוריות"}</h2>
          <HBars rows={a.categories.slice(0, 10).map((r) => ({ key: r.key, label: r.label, value: r.value, color: r.color, sub: `${formatPercent(r.value / total)} · ${r.count} עסקאות`, href: u({ cat: r.key }) }))} />
          {a.categories.length === 0 && <p className="muted tiny">אין נתונים בטווח.</p>}</section>
        <section className="card"><h2 className="h3">בתי עסק</h2>
          <HBars rows={a.merchants.map((r) => ({ key: r.key, label: r.label, value: r.value, sub: `${r.count} עסקאות`, href: u({ merchant: r.key }) }))} /></section>
        <section className="card"><h2 className="h3">מוצרים</h2>
          <HBars rows={a.products.map((r) => ({ key: r.key, label: r.label, value: r.value, sub: `${r.count} קניות`, href: u({ product: r.key }) }))} />
          {a.products.length === 0 && <p className="muted tiny">אין מוצרים מזוהים בטווח.</p>}</section>
        <section className="card"><h2 className="h3">קבועות מול משתנות</h2>
          <HBars rows={[{ key: "f", label: "קבועות", value: a.split.fixed, sub: formatPercent(a.split.fixed / total) }, { key: "v", label: "משתנות", value: a.split.variable, color: "var(--accent)", sub: formatPercent(a.split.variable / total) }, { key: "o", label: "חד-פעמיות", value: a.split.oneOff, color: "var(--warning)", sub: formatPercent(a.split.oneOff / total) }]} />
          <h2 className="h3" style={{ marginTop: 18 }}>חיוניות מול סגנון חיים</h2>
          <HBars rows={[{ key: "e", label: "חיוניות", value: a.essential.essential, sub: formatPercent(a.essential.essential / total) }, { key: "l", label: "סגנון חיים", value: a.essential.lifestyle, color: "var(--accent)", sub: formatPercent(a.essential.lifestyle / total) }]} />
          <p className="muted tiny">חיובים קבועים בטווח: <b>{formatAgorot(a.recurring)}</b></p></section>
      </div>

      <section className="card"><h2 className="h3">חיסכון ושיעור חיסכון — 6 חודשים</h2>
        <p className="muted tiny">הכנסה פחות הוצאות. הפקדות להשקעות/חיסכון מוצגות בנפרד ואינן הוצאה.</p>
        <Bars data={savings.map((m) => ({ key: m.key, label: `${m.key.slice(5)} · ${formatPercent(m.rate)}`, parts: [{ value: Math.max(0, m.saved), color: "var(--positive)" }] }))} height={150} />
        <div className="legend-inline"><span>הושקע/נחסך בנפרד בחודש האחרון: <b className="tnum">{formatAgorot(savings.at(-1)?.invested ?? 0)}</b></span></div></section>

      <section>
        <div className="section-h"><h2 className="h3">{crumbs.length ? "העסקאות שמאחורי המספר" : "עסקאות אחרונות בטווח"}</h2><Link href={hrefFor(listQuery)}>הצג הכול ({a.count})</Link></div>
        <div className="card"><div className="exp-list">{[...a.matching].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 15).map((t) => <TxnRow key={t.id} t={t} product={t.productId ? pname.get(t.productId) : undefined} href={`/transactions/${t.id}`} />)}</div></div>
      </section>
    </div>
  );
}
