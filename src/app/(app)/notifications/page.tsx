import Link from "next/link";
import { getContext } from "@/lib/context";
import { markNotificationsReadAction } from "@/app/account-actions";
import { formatDateTimeIL } from "@/lib/format";

export const metadata = { title: "התראות — MoneyTalk" };

export default async function Notifications() {
  const ctx = await getContext();
  const items = await ctx.read.notifications();
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="stack-col">
      <div className="spread"><h1 className="ttl">התראות</h1>{unread > 0 && !ctx.demo && <form action={markNotificationsReadAction}><button className="sort">סמן הכול כנקרא</button></form>}</div>
      {items.length === 0 && <div className="empty"><div className="em">🔔</div><div className="t">אין התראות</div><div className="s">נעדכן אותך רק כשיש משהו שחשוב לדעת.</div></div>}
      <div className="insights">{items.map((n) => (
        <div key={n.id} className={`insight-row ${n.readAt ? "" : "attention"}`}><i className="dotc" aria-hidden /><div className="grow"><p dir="auto"><b>{n.title}</b></p>{n.body && <p className="muted tiny">{n.body}</p>}<span className="tiny muted">{formatDateTimeIL(n.createdAt)}</span></div>{n.link && <Link href={n.link} aria-label="פתח">‹</Link>}</div>
      ))}</div>
    </div>
  );
}
