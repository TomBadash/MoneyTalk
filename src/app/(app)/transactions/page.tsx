import Link from "next/link";
import { getContext } from "@/lib/context";
import { paramsToQuery, matches, hrefFor, type TxnQuery } from "@/services/search";
import { TxnRow } from "@/components/txn-row";
import { TxnSearch } from "@/components/txn-search";
import { formatAgorot, relativeDayLabel, formatIso } from "@/lib/format";
import { isConsumption } from "@/engine/consumption";
import { nodeInfo } from "@/classify/taxonomy";

export const metadata = { title: "תנועות — MoneyTalk" };
const PAGE = 120;

export default async function Transactions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const q = paramsToQuery(sp, ctx.today);
  const limit = Math.min(2000, Number(Array.isArray(sp.limit) ? sp.limit[0] : sp.limit) || PAGE);

  const [all, products] = await Promise.all([ctx.read.txns({ from: q.from, to: q.to, needsReview: q.review ? true : undefined }), ctx.read.products()]);
  const pname = new Map(products.map((p) => [p.id, p.name]));
  const L = { productName: (id?: string | null) => (id ? pname.get(id) ?? "" : "") };
  const rows = all.filter((t) => matches(t, q, L));
  const shown = rows.slice(0, limit);
  const spend = rows.filter(isConsumption).reduce((s, t) => s + t.amount, 0);

  const groups = new Map<string, typeof shown>();
  for (const t of shown) (groups.get(t.date) ?? groups.set(t.date, []).get(t.date)!).push(t);

  const chips: { label: string; drop: TxnQuery }[] = [];
  if (q.categoryId) chips.push({ label: nodeInfo(q.categoryId).he, drop: { ...q, categoryId: undefined } });
  if (q.merchant) chips.push({ label: q.merchant, drop: { ...q, merchant: undefined } });
  if (q.productId) chips.push({ label: pname.get(q.productId) ?? "מוצר", drop: { ...q, productId: undefined } });
  if (q.from || q.to) chips.push({ label: `${q.from ? formatIso(q.from) : "…"} – ${q.to ? formatIso(q.to) : "…"}`, drop: { ...q, from: undefined, to: undefined } });
  if (q.min != null || q.max != null) chips.push({ label: `₪${q.min != null ? Math.round(q.min / 100) : ""}${q.min === q.max ? "" : `–${q.max != null ? Math.round(q.max / 100) : ""}`}`, drop: { ...q, min: undefined, max: undefined } });
  if (q.review) chips.push({ label: "לאישור", drop: { ...q, review: undefined } });

  return (
    <div>
      <div className="spread"><h1 className="ttl">תנועות</h1>{!q.review && <Link className="sort" href="/review">תור אישור</Link>}</div>
      <div style={{ marginTop: 14 }}><TxnSearch /></div>
      {chips.length > 0 && <div className="chips" style={{ marginTop: 10 }}>{chips.map((c) => <Link key={c.label} href={hrefFor(c.drop)} className="chip active" aria-label={`הסר סינון ${c.label}`}>{c.label} ✕</Link>)}</div>}
      <p className="muted tiny" style={{ margin: "12px 4px 0" }} aria-live="polite">{rows.length} תנועות{spend > 0 ? ` · הוצאות ${formatAgorot(spend)}` : ""}</p>

      {shown.length === 0 && <div className="empty"><div className="em">🔎</div><div className="t">לא נמצאו תנועות</div><div className="s">נסה חיפוש אחר, או הסר סינון.</div></div>}
      <div className="exp-list">
        {[...groups.entries()].map(([date, ts]) => (
          <section key={date}>
            <h2 className="day-h">{(() => { const l = relativeDayLabel(date); return l === "היום" || l === "אתמול" ? `${l} · ${formatIso(date)}` : formatIso(date); })()}</h2>
            {ts.map((t) => <TxnRow key={t.id} t={t} product={t.productId ? pname.get(t.productId) : undefined} href={`/transactions/${t.id}`} />)}
          </section>
        ))}
      </div>
      {rows.length > shown.length && <p style={{ textAlign: "center", marginTop: 16 }}><Link className="sort" href={`${hrefFor(q)}${hrefFor(q).includes("?") ? "&" : "?"}limit=${limit + PAGE}`}>הצג עוד</Link></p>}
    </div>
  );
}
