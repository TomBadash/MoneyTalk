import Link from "next/link";
import { getContext } from "@/lib/context";
import { productStats } from "@/engine/analytics";
import { formatAgorot, formatSignedPercent } from "@/lib/format";
import { nodeInfo } from "@/classify/taxonomy";
import { TxnSearch } from "@/components/txn-search";
import { normalizeText } from "@/classify/normalize";

export const metadata = { title: "מוצרים — MoneyTalk" };
const SORTS = { count: "נקנו הכי הרבה", total: "הוצאה גבוהה", rise: "עליית מחיר" } as const;

export default async function Products({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string }> }) {
  const sp = await searchParams;
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : "count") as keyof typeof SORTS;
  const ctx = await getContext();
  const [txns, products] = await Promise.all([ctx.read.txns(), ctx.read.products()]);
  const pmap = new Map(products.map((p) => [p.id, p]));
  const q = sp.q ? normalizeText(sp.q) : "";
  let stats = productStats(txns).filter((s) => pmap.has(s.productId)).filter((s) => !q || normalizeText(pmap.get(s.productId)!.name).includes(q));
  stats = stats.sort((a, b) => sort === "total" ? b.total - a.total : sort === "rise" ? (b.priceChange ?? -9) - (a.priceChange ?? -9) : b.count - a.count || b.total - a.total).slice(0, 40);
  const withChange = productStats(txns).filter((s) => s.priceChange != null && s.count >= 6);
  const infl = withChange.length >= 3 ? withChange.reduce((s, x) => s + x.priceChange!, 0) / withChange.length : null;

  return (
    <div className="stack-col">
      <div className="spread"><h1 className="ttl">מוצרים</h1><Link href="/merchants" className="sort">בתי עסק</Link></div>
      <p className="muted" style={{ marginTop: -8 }}>הזיכרון האישי שלך: מה אתה קונה, כמה ובאיזה מחיר.</p>
      <TxnSearch placeholder="חיפוש מוצר…" />
      {infl != null && <div className="insight-row neutral"><i className="dotc" aria-hidden /><p>המחיר הממוצע של המוצרים שאתה קונה בקביעות השתנה ב-<b>{formatSignedPercent(infl)}</b> (אינפלציה אישית).</p></div>}
      <div className="tabs" role="tablist">{(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => <Link key={k} role="tab" aria-selected={k === sort} href={`/products?sort=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={`chip ${k === sort ? "active" : ""}`}>{SORTS[k]}</Link>)}</div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>מוצר</th><th className="n">קניות</th><th className="n">ממוצע</th><th className="n">סה״כ</th><th className="n">שינוי</th></tr></thead>
          <tbody>
            {stats.map((s) => { const p = pmap.get(s.productId)!; return (
              <tr key={s.productId}><td><Link href={`/products/${s.productId}`} dir="auto">{p.name}</Link><div className="tiny muted">{nodeInfo(p.categoryId).he}</div></td>
                <td className="n tnum">{s.count}</td><td className="n tnum">{formatAgorot(s.avg, true)}</td><td className="n tnum">{formatAgorot(s.total)}</td>
                <td className={`n tnum ${s.priceChange != null && s.priceChange > 0.03 ? "warn" : s.priceChange != null && s.priceChange < -0.03 ? "pos" : ""}`}>{s.priceChange == null ? "—" : formatSignedPercent(s.priceChange)}</td></tr>
            ); })}
            {stats.length === 0 && <tr><td colSpan={5} className="muted">לא נמצאו מוצרים.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
