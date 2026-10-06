import Link from "next/link";
import { NAV } from "@/components/nav-items";

export const metadata = { title: "MoneyTalk — עוד" };

export default function More() {
  const items = NAV.filter((n) => !["/", "/transactions", "/analytics"].includes(n.href));
  return (
    <div>
      <h1 className="ttl">עוד</h1>
      <div className="card list" style={{ marginTop: 16 }}>
        {items.map((n) => (
          <Link key={n.href} href={n.href} className="morerow">
            <span className="gi" aria-hidden>{n.icon}</span><span className="grow">{n.label}</span>
            {"soon" in n && n.soon && <small className="soon">בקרוב</small>}<span aria-hidden>‹</span>
          </Link>
        ))}
        <Link href="/report" className="morerow"><span className="gi" aria-hidden>📅</span><span className="grow">דוח חודשי</span><span aria-hidden>‹</span></Link>
        <Link href="/merchants" className="morerow"><span className="gi" aria-hidden>🏪</span><span className="grow">בתי עסק</span><span aria-hidden>‹</span></Link>
      </div>
    </div>
  );
}
