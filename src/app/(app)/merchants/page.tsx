import Link from "next/link";
import { getContext } from "@/lib/context";
import { merchantStats } from "@/engine/analytics";
import { formatAgorot, formatIso } from "@/lib/format";

export const metadata = { title: "בתי עסק — MoneyTalk" };

export default async function Merchants() {
  const ctx = await getContext();
  const stats = merchantStats(await ctx.read.txns()).slice(0, 60);
  return (
    <div className="stack-col">
      <div className="spread"><h1 className="ttl">בתי עסק</h1><Link href="/products" className="sort">מוצרים</Link></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>בית עסק</th><th className="n">עסקאות</th><th className="n">ממוצע</th><th className="n">סה״כ</th><th className="n">אחרונה</th></tr></thead>
          <tbody>{stats.map((s) => (
            <tr key={s.key}><td><Link href={`/merchants/${encodeURIComponent(s.key)}`} dir="auto">{s.name}</Link></td><td className="n tnum">{s.count}</td><td className="n tnum">{formatAgorot(s.avg)}</td><td className="n tnum">{formatAgorot(s.total)}</td><td className="n tnum">{formatIso(s.last)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
