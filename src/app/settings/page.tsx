"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/auth/actions";

const cloud = isSupabaseConfigured();

export default function SettingsPage() {
  const { expenses, recurring } = useStore();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!cloud) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  function resetDemo() {
    if (confirm("לאפס את כל הנתונים המקומיים ולהתחיל מחדש?")) {
      localStorage.removeItem("moneytalk:expenses");
      location.reload();
    }
  }

  return (
    <AppShell title="הגדרות">
      <div className="card">
        <div className="spread">
          <span style={{ fontWeight: 700 }}>מספר הוצאות שמורות</span>
          <span className="tnum muted">{expenses.length}</span>
        </div>
      </div>

      <div className="section-h">
        <h3>הוצאות קבועות</h3>
      </div>
      <Link href="/recurring" className="card" style={{ display: "block" }}>
        <div className="spread">
          <div>
            <div style={{ fontWeight: 700 }}>🔁 ניהול הוצאות קבועות</div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              שכר דירה, מנויים וחיובים חודשיים — נרשמים אוטומטית
            </div>
          </div>
          <span
            className="tnum muted"
            style={{ marginInlineStart: "auto", fontWeight: 800 }}
          >
            {recurring.length} ←
          </span>
        </div>
      </Link>

      {cloud ? (
        <>
          <div className="section-h">
            <h3>חשבון</h3>
          </div>
          <div className="card">
            <div className="spread" style={{ marginBottom: 14 }}>
              <span style={{ fontWeight: 700 }}>מחובר כ‑</span>
              <span className="muted" dir="ltr">
                {email ?? "…"}
              </span>
            </div>
            <form action={signOut}>
              <button className="btn ghost" type="submit">
                התנתקות
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <div className="section-h">
            <h3>נתונים</h3>
          </div>
          <div className="card">
            <p
              className="muted tiny"
              style={{ marginBottom: 14, lineHeight: 1.7 }}
            >
              בגרסה הנוכחית הנתונים נשמרים מקומית בדפדפן (דמו). בהמשך נחבר את
              האפליקציה ל‑Supabase עם התחברות ושמירה בענן.
            </p>
            <button className="btn ghost" onClick={resetDemo}>
              איפוס נתוני דמו
            </button>
          </div>
        </>
      )}

      <div className="empty">
        <div className="em">⚙︎</div>
        <div className="t">עוד הגדרות בקרוב</div>
        <div className="s">ניהול קטגוריות, יעדים ושווי נקי — בפיתוח.</div>
      </div>
    </AppShell>
  );
}
