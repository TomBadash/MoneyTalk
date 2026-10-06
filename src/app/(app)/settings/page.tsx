import { getContext } from "@/lib/context";
import { saveProfileAction, savePrefsAction, revokeApiKeyAction, deleteImportedDataAction, deleteAccountAction } from "@/app/account-actions";
import { signOut } from "@/app/auth/actions";
import { ApiKeyForm } from "@/components/api-key-form";
import { DEFAULT_PREFS } from "@/engine/notifications";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatDateTimeIL } from "@/lib/format";

export const metadata = { title: "הגדרות — MoneyTalk" };
type SP = Record<string, string | undefined>;
const sh = (a: number) => (a ? String(Math.round(a / 100)) : "");
const PREF_LABEL = { budget_80: "ניצלת 80% מתקציב קטגוריה", weekly_pace: "ההוצאות גבוהות מהקצב הרגיל", price_change: "מנוי או חשבון התייקרו", new_recurring: "זוהה חיוב חוזר חדש", weekly_left: "תזכורת שבועית: כמה נשאר להוציא" } as const;
const ERR: Record<string, string> = { confirm: "כדי למחוק יש להקליד ״מחק״.", local: "אין חשבון למחיקה בהרצה מקומית.", service: "מחיקת חשבון דורשת הגדרת SUPABASE_SERVICE_ROLE_KEY בשרת.", delete: "לא הצלחנו למחוק את החשבון. נסה שוב." };

export default async function Settings({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const demoOnly = ctx.demo && !ctx.local;
  const [profile, keys] = await Promise.all([ctx.write.profile(), ctx.write.apiKeys()]);
  const prefs = { ...DEFAULT_PREFS, ...profile.notificationPrefs };

  return (
    <div className="stack-col">
      <h1 className="ttl">הגדרות</h1>
      {sp.saved && <div role="status" className="notice ok">נשמר.</div>}
      {sp.deleted && <div role="status" className="notice ok">הנתונים נמחקו.</div>}
      {sp.error && <div role="alert" className="notice bad">{ERR[sp.error] ?? "משהו השתבש."}</div>}
      {ctx.demo && <div className="notice">{ctx.local ? "מצב הדגמה מקומי: שינויים לא נשמרים מעבר להפעלת השרת." : "אתה רואה נתוני דוגמה. הגדרות שתשנה כאן נשמרות לחשבון האמיתי שלך."}</div>}

      <section className="card stack-col" aria-labelledby="pf-h"><h2 id="pf-h" className="h3">הפרופיל הפיננסי שלך</h2>
        <p className="muted tiny">משמש לחישוב יעד ההוצאות. ככל שיצטברו נתונים, נעדכן את ההערכות לבד.</p>
        <form action={saveProfileAction} className="inline-form">
          <div className="field"><label className="muted tiny" htmlFor="p-n">שם</label><input id="p-n" name="displayName" className="input" defaultValue={profile.displayName ?? ""} /></div>
          <div className="field"><label className="muted tiny" htmlFor="p-i">הכנסה נטו חודשית (₪)</label><input id="p-i" name="income" className="input" inputMode="decimal" defaultValue={sh(profile.monthlyIncome)} style={{ width: 130 }} /></div>
          <div className="field"><label className="muted tiny" htmlFor="p-r">שכר דירה (₪)</label><input id="p-r" name="rent" className="input" inputMode="decimal" defaultValue={sh(profile.monthlyRent)} style={{ width: 110 }} /></div>
          <div className="field"><label className="muted tiny" htmlFor="p-s">חיסכון חודשי (₪)</label><input id="p-s" name="savings" className="input" inputMode="decimal" defaultValue={sh(profile.monthlySavingsTarget)} style={{ width: 110 }} /></div>
          <div className="field"><label className="muted tiny" htmlFor="p-v">השקעה חודשית (₪)</label><input id="p-v" name="investments" className="input" inputMode="decimal" defaultValue={sh(profile.monthlyInvestmentTarget)} style={{ width: 110 }} /></div>
          <div className="field"><label className="muted tiny" htmlFor="p-t">יעד הוצאות משתנות (₪, ריק = אוטומטי)</label><input id="p-t" name="variableTarget" className="input" inputMode="decimal" defaultValue={sh(profile.variableTarget ?? 0)} style={{ width: 130 }} /></div>
          <button className="btn">שמירה</button>
        </form></section>

      <section className="card stack-col" aria-labelledby="nt-h"><h2 id="nt-h" className="h3">התראות</h2>
        <form action={savePrefsAction} className="stack-col">
          {(Object.keys(PREF_LABEL) as (keyof typeof PREF_LABEL)[]).map((k) => <label key={k} className="check"><input type="checkbox" name={k} defaultChecked={prefs[k]} /> {PREF_LABEL[k]}</label>)}
          <button className="btn ghost" style={{ width: "auto", alignSelf: "flex-start" }}>שמירה</button>
        </form></section>

      <section className="card stack-col" aria-labelledby="ak-h"><h2 id="ak-h" className="h3">מפתחות API</h2>
        <p className="muted tiny">להוספת הוצאות מכל מקום: <code dir="ltr">POST /api/v1/expense</code> עם <code dir="ltr">{`{"description":"סלמון","amount":59}`}</code>. אנחנו שומרים רק גיבוב של המפתח.</p>
        {keys.map((k) => <form key={k.id} action={revokeApiKeyAction} className="acc"><div className="grow"><b>{k.name}</b> <code dir="ltr">{k.prefix}…</code><div className="tiny muted">נוצר {formatDateTimeIL(k.createdAt)}{k.lastUsedAt ? ` · שימוש אחרון ${formatDateTimeIL(k.lastUsedAt)}` : ""}</div></div>
          {k.revoked ? <span className="muted tiny">בוטל</span> : <><input type="hidden" name="id" value={k.id} /><button className="tlink">ביטול מפתח</button></>}</form>)}
        <ApiKeyForm /></section>

      <section className="card stack-col" aria-labelledby="dt-h"><h2 id="dt-h" className="h3">הנתונים שלך</h2>
        <p className="muted tiny">המידע הפיננסי שלך פרטי כברירת מחדל. אפשר לייצא או למחוק אותו בכל רגע.</p>
        <a className="btn ghost" href="/api/export" download>ייצוא כל הנתונים (JSON)</a>
        <form action={deleteImportedDataAction} className="inline-form" aria-label="מחיקת נתונים מיובאים">
          <div className="field"><label className="muted tiny" htmlFor="d-c">מחיקת כל התנועות (הקלד ״מחק״)</label><input id="d-c" name="confirm" className="input" autoComplete="off" style={{ width: 120 }} /></div>
          <button className="btn ghost danger" disabled={demoOnly}>מחיקת תנועות</button>
        </form>
        <form action={deleteAccountAction} className="inline-form" aria-label="מחיקת חשבון">
          <div className="field"><label className="muted tiny" htmlFor="d-a">מחיקת החשבון וכל המידע (הקלד ״מחק״)</label><input id="d-a" name="confirm" className="input" autoComplete="off" style={{ width: 120 }} /></div>
          <button className="btn ghost danger" disabled={ctx.local}>מחיקת חשבון</button>
        </form></section>

      <section className="card row" style={{ justifyContent: "space-between" }}>
        <div><b>מראה</b><div className="muted tiny">{ctx.email ?? "מצב מקומי"}</div></div>
        <div className="row"><ThemeToggle />{!ctx.local && <form action={signOut}><button className="sort">התנתקות</button></form>}</div>
      </section>
    </div>
  );
}
