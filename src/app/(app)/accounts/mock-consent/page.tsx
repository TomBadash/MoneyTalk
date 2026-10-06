import { completeConnectAction } from "@/app/account-actions";

export const metadata = { title: "הרשאת גישה — MoneyTalk" };

/** Stand-in for a provider's hosted consent screen (a real aggregator would show its own page). */
export default async function MockConsent({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state = "" } = await searchParams;
  return (
    <div className="stack-col" style={{ maxWidth: 520 }}>
      <h1 className="ttl">הרשאת גישה — בנק לדוגמה</h1>
      <div className="card stack-col">
        <p><b>MoneyTalk</b> מבקשת הרשאה <b>לקריאה בלבד</b>.</p>
        <ul className="ticks"><li>יתרות וחשבונות</li><li>תנועות בנק וכרטיס אשראי (עד 13 חודשים אחורה)</li></ul>
        <p className="muted tiny">אין הרשאה לבצע פעולות או העברות. אפשר לבטל בכל רגע. תוקף ההרשאה: 90 יום.</p>
        <form action={completeConnectAction} className="stack-col">
          <input type="hidden" name="state" value={state} />
          <button className="btn" name="consent" value="granted">אישור</button>
          <button className="btn ghost" name="consent" value="denied">ביטול</button>
        </form>
      </div>
    </div>
  );
}
