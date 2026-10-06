import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { merchantStats, monthlySeries } from "@/engine/analytics";
import { Bars, HBars } from "@/components/charts";
import { TxnRow } from "@/components/txn-row";
import { formatAgorot, formatIso } from "@/lib/format";
import { monthKey } from "@/engine/period";

export default async function MerchantPage({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const ctx = await getContext();
  const txns = await ctx.read.txns({ merchantNormalized: key });
  const s = merchantStats(txns)[0];
  if (!s) notFound();
  const products = await ctx.read.products();
  const pname = new Map(products.map((p) => [p.id, p.name]));
  const series = monthlySeries(txns, monthKey(ctx.today), 12);
  const byProduct = new Map<string, number>();
  txns.forEach((t) => t.productId && byProduct.set(t.productId, (byProduct.get(t.productId) ?? 0) + t.amount));
  return (
    <div className="stack-col">
      <Link href="/merchants" className="muted tiny">‹ בתי עסק</Link>
      <h1 className="ttl" dir="auto">{s.name}</h1>
      <section className="stats4">
        <div className="stat"><div className="k">סה״כ</div><div className="v tnum">{formatAgorot(s.total)}</div></div>
        <div className="stat"><div className="k">עסקאות</div><div className="v tnum">{s.count}</div></div>
        <div className="stat"><div className="k">ממוצע לעסקה</div><div className="v tnum">{formatAgorot(s.avg, true)}</div></div>
        <div className="stat"><div className="k">אחרונה</div><div className="v">{formatIso(s.last)}</div></div>
      </section>
      <section className="card"><h2 className="h3">מגמה חודשית</h2>
        <Bars data={series.map((p) => ({ key: p.key, label: p.key.slice(5), parts: [{ value: p.total, color: "var(--accent)" }] }))} /></section>
      {byProduct.size > 0 && <section className="card"><h2 className="h3">מוצרים שנקנו כאן</h2>
        <HBars rows={[...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => ({ key: id, label: pname.get(id) ?? "מוצר", value: v, href: `/products/${id}` }))} /></section>}
      <div className="section-h"><h2 className="h3">עסקאות</h2><Link href={`/transactions?merchant=${encodeURIComponent(key)}`}>הצג הכול</Link></div>
      <div className="card"><div className="exp-list">{txns.slice(0, 12).map((t) => <TxnRow key={t.id} t={t} href={`/transactions/${t.id}`} />)}</div></div>
    </div>
  );
}
