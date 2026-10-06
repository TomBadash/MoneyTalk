import Link from "next/link";
import { getContext } from "@/lib/context";
import { listProviders } from "@/providers/registry";
import { beginConnectAction, disconnectAction, syncNowAction, importCsvAction, addCashAction } from "@/app/account-actions";
import { formatAgorot, formatDateTimeIL, formatIso } from "@/lib/format";

export const metadata = { title: "חשבונות — MoneyTalk" };
type SP = Record<string, string | undefined>;
const MSG: Record<string, [string, "ok" | "bad"]> = {
  connected: ["החשבון חובר. ייבאנו את התנועות והדשבורד התעדכן.", "ok"], synced: ["הסנכרון הסתיים.", "ok"], disconnected: ["החיבור הוסר. התנועות שיובאו נשארו — אפשר למחוק אותן בהגדרות.", "ok"],
  denied: ["לא אישרת את ההרשאה, ולכן לא חיברנו כלום.", "bad"], state: ["הבקשה פגה. נסה לחבר שוב.", "bad"], connect: ["לא הצלחנו להשלים את החיבור כרגע. אפשר לנסות שוב, או לייבא קובץ.", "bad"],
  nofile: ["לא נבחר קובץ.", "bad"], toolarge: ["הקובץ גדול מדי (עד 2MB).", "bad"], provider: ["ספק לא מוכר.", "bad"],
};
const KIND = { bank: "חשבונות בנק", credit_card: "כרטיסי אשראי", cash: "מזומן", brokerage: "השקעות", pension: "השקעות", provident: "השקעות", education_fund: "השקעות", crypto: "השקעות" } as const;

export default async function Accounts({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const ro = ctx.demo && !ctx.local ? false : false; // connecting from demo mode is exactly the point
  const [accounts, connections] = await Promise.all([ctx.write.accounts(), ctx.write.connections()]);
  const shown = accounts.length ? accounts : ctx.demo ? await ctx.read.accounts() : [];
  const connBy = new Map(connections.map((c) => [c.id, c]));
  const note = sp.imported ? [Number(sp.imported) === 0 ? "לא נמצאו תנועות חדשות — הכול כבר יובא קודם." : `יובאו ${sp.imported} תנועות חדשות${Number(sp.skipped) ? ` (${sp.skipped} שורות דולגו)` : ""}.`, "ok" as const] : sp.error === "csv" ? [sp.msg ?? "לא הצלחנו לקרוא את הקובץ.", "bad" as const] : MSG[sp.connected ? "connected" : sp.synced ? "synced" : sp.disconnected ? "disconnected" : sp.error ?? ""];
  const groups = (["bank", "credit_card", "cash"] as const).map((k) => ({ k, rows: shown.filter((a) => a.kind === k) })).filter((g) => g.rows.length);

  return (
    <div className="stack-col">
      <div className="spread"><h1 className="ttl">חשבונות</h1>
        {connections.length > 0 && <form action={syncNowAction}><button className="sort">↻ סנכרון עכשיו</button></form>}</div>
      {note && <div role="status" className={`notice ${note[1]}`}>{note[0]}</div>}

      {groups.map((g) => (
        <section key={g.k} aria-labelledby={`g-${g.k}`}>
          <div className="section-h"><h2 id={`g-${g.k}`} className="h3">{KIND[g.k]}</h2></div>
          <div className="card list">
            {g.rows.map((a) => {
              const c = a.connectionId ? connBy.get(a.connectionId) : undefined;
              const health = c ? (c.status === "active" ? ["מחובר", "good"] : c.status === "needs_reauth" ? ["נדרש חידוש הרשאה", "warn"] : ["בעיה זמנית", "warn"]) : null;
              return (
                <div key={a.id} className="acc">
                  <div className="grow">
                    <div className="spread"><b dir="auto">{a.name}</b>{a.balance != null && <b className="tnum">{formatAgorot(a.balance)}</b>}</div>
                    <div className="tiny muted">{a.institution}{c?.lastSuccessfulSync ? ` · עודכן ${formatDateTimeIL(c.lastSuccessfulSync)}` : ""}{c?.consentExpiresAt ? ` · הרשאה עד ${formatIso(c.consentExpiresAt.slice(0, 10))}` : ""}</div>
                    {c?.status !== "active" && c?.lastError && <div className="tiny warn">{c.lastError}</div>}
                  </div>
                  {health && <span className={`status ${health[1]}`}>{health[0]}</span>}
                </div>
              );
            })}
            {g.k !== "cash" && connections.filter((c) => shown.some((a) => a.connectionId === c.id && a.kind === g.k)).map((c) => (
              <form key={c.id} action={disconnectAction} className="acc-foot"><input type="hidden" name="id" value={c.id} /><button className="tlink" aria-label={`הסרת החיבור ל${c.institution}`}>הסר חיבור ל{c.institution}</button></form>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="inv-h"><div className="section-h"><h2 id="inv-h" className="h3">השקעות</h2></div>
        <div className="card muted tiny">חשבונות השקעה, פנסיה וקרנות השתלמות יתחברו בשלב הבא — <Link className="lnk" href="/investments">מה בדרך</Link>.</div></section>

      <section aria-labelledby="cn-h">
        <div className="section-h"><h2 id="cn-h" className="h3">{accounts.length ? "חיבור חשבון נוסף" : "חבר חשבון בנק"}</h2></div>
        <div className="card stack-col">
          <p className="muted tiny">החיבור לקריאה בלבד, דרך מסך ההרשאה של הספק. אנחנו לא רואים ולא שומרים סיסמאות בנק, ואי אפשר לבצע פעולות בחשבון.</p>
          {listProviders().map((p) => <form key={p.id} action={beginConnectAction}><input type="hidden" name="provider" value={p.id} /><button className="btn" disabled={ro}>חיבור — {p.displayName}</button></form>)}
          <hr className="rule" />
          <form action={importCsvAction} className="inline-form">
            <div className="field"><label className="muted tiny" htmlFor="csv-k">סוג</label><select id="csv-k" name="kind" className="select"><option value="bank">חשבון בנק</option><option value="credit_card">כרטיס אשראי</option></select></div>
            <div className="field"><label className="muted tiny" htmlFor="csv-f">קובץ CSV מהבנק או מחברת האשראי</label><input id="csv-f" name="file" type="file" accept=".csv,text/csv" className="input" required /></div>
            <button className="btn ghost">ייבוא</button>
          </form>
          <p className="tiny muted">קובץ Excel? שמור אותו כ-CSV ואז ייבא. ייבוא חוזר של אותו קובץ לא יוצר כפילויות.</p>
          <form action={addCashAction} className="inline-form"><div className="field"><label className="muted tiny" htmlFor="cash-b">הוספת מזומן — יתרה (₪)</label><input id="cash-b" name="balance" className="input" inputMode="decimal" defaultValue="0" style={{ width: 120 }} /></div><button className="btn ghost">הוספה</button></form>
        </div>
      </section>
    </div>
  );
}
