import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { productStats } from "@/engine/analytics";
import { Spark } from "@/components/charts";
import { TxnRow } from "@/components/txn-row";
import { formatAgorot, formatIso, formatSignedPercent } from "@/lib/format";
import { nodeInfo } from "@/classify/taxonomy";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const [products, txns] = await Promise.all([ctx.read.products(), ctx.read.txns({ productId: id })]);
  const p = products.find((x) => x.id === id);
  const s = productStats(txns)[0];
  if (!p || !s) notFound();
  const chrono = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  const merchants = new Map<string, number>();
  txns.forEach((t) => t.merchantRaw && merchants.set(t.merchantRaw, (merchants.get(t.merchantRaw) ?? 0) + 1));
  return (
    <div className="stack-col">
      <Link href="/products" className="muted tiny">‹ מוצרים</Link>
      <h1 className="ttl" dir="auto">{p.name}</h1>
      <p className="muted" style={{ marginTop: -8 }}>{nodeInfo(p.parentCategoryId).he} › {nodeInfo(p.categoryId).he} › {nodeInfo(p.subcategoryId).he}</p>
      <section className="stats4">
        <div className="stat"><div className="k">קניות</div><div className="v tnum">{s.count}</div></div>
        <div className="stat"><div className="k">מחיר ממוצע</div><div className="v tnum">{formatAgorot(s.avg, true)}</div><div className="sub muted">{formatAgorot(s.min, true)} – {formatAgorot(s.max, true)}</div></div>
        <div className="stat"><div className="k">סה״כ</div><div className="v tnum">{formatAgorot(s.total)}</div></div>
        <div className="stat"><div className="k">מחיר אחרון</div><div className="v tnum">{formatAgorot(s.last, true)}</div>{s.priceChange != null && <div className={`sub ${s.priceChange > 0 ? "warn" : "pos"}`}>{formatSignedPercent(s.priceChange)} בממוצע</div>}</div>
      </section>
      <section className="card"><h2 className="h3">היסטוריית מחיר</h2><Spark values={chrono.map((t) => t.amount)} label={`מחיר ${p.name} לאורך זמן`} />
        <p className="tiny muted">מ-{formatIso(s.first)} עד {formatIso(s.lastDate)}{merchants.size > 0 && <> · נקנה ב: {[...merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m]) => m).join(", ")}</>}</p></section>
      <div className="section-h"><h2 className="h3">קניות אחרונות</h2><Link href={`/transactions?product=${id}`}>הצג את כל העסקאות</Link></div>
      <div className="card"><div className="exp-list">{txns.slice(0, 12).map((t) => <TxnRow key={t.id} t={t} product={p.name} href={`/transactions/${t.id}`} />)}</div></div>
    </div>
  );
}
