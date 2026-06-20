"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useStore, firstOfMonthISO } from "@/lib/store";
import { CATEGORIES, getCategory } from "@/lib/categories";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { parseQuickEntry } from "@/lib/parse-quick";
import { formatMoney, formatTime, relativeDayLabel } from "@/lib/format";
import { recent } from "@/lib/selectors";

function addMonthsISO(startISO: string, n: number): string {
  const d = new Date(startISO);
  return firstOfMonthISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export default function AddExpensePage() {
  const { expenses, addExpense, addRecurring } = useStore();

  const [quick, setQuick] = useState("");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("restaurants");
  const [paymentMethodId, setPaymentMethodId] = useState("credit");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [note, setNote] = useState("");
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [recurDuration, setRecurDuration] = useState<"forever" | "count">("forever");
  const [recurMonths, setRecurMonths] = useState("12");
  const [recurDay, setRecurDay] = useState("");
  const [showToast, setShowToast] = useState(false);

  // Default date/time to "now" on the client (avoids hydration mismatch).
  useEffect(() => {
    const now = new Date();
    setDateStr(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}`
    );
    setTimeStr(
      `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`
    );
  }, []);

  const parsed = useMemo(() => parseQuickEntry(quick), [quick]);

  function applyQuick() {
    if (parsed.title) setTitle(parsed.title);
    if (parsed.amount != null) setAmount(String(parsed.amount));
    setQuick("");
  }

  function toggleRecurring() {
    setMakeRecurring((on) => {
      const next = !on;
      // When turning it on, default the charge day to the chosen date's day.
      if (next) {
        const day = dateStr ? Number(dateStr.split("-")[2]) : 1;
        setRecurDay(String(Math.min(28, Math.max(1, day || 1))));
      }
      return next;
    });
  }

  const canSubmit = title.trim() !== "" && Number(amount) > 0;

  function submit() {
    if (!canSubmit) return;
    const iso =
      dateStr && timeStr
        ? new Date(`${dateStr}T${timeStr}`).toISOString()
        : new Date().toISOString();
    addExpense({
      title,
      amount: Number(amount),
      categoryId,
      paymentMethodId,
      note,
      date: iso,
    });
    // Optionally turn this into a monthly recurring rule. The one-off above
    // covers the current month, so the rule starts NEXT month to avoid
    // double-counting. "מספר חודשים" is the total count incl. this month, so
    // the rule needs (total - 1) future months.
    if (makeRecurring) {
      const base = new Date(iso);
      const nextStart = firstOfMonthISO(
        new Date(base.getFullYear(), base.getMonth() + 1, 1)
      );
      const total = Math.max(1, Number(recurMonths) || 1);
      // count mode with total <= 1 means "this month only" → no rule needed.
      if (recurDuration !== "count" || total > 1) {
        addRecurring({
          title,
          amount: Number(amount),
          categoryId,
          paymentMethodId,
          note,
          dayOfMonth: Math.min(28, Math.max(1, Number(recurDay) || base.getDate())),
          startMonth: nextStart,
          endMonth:
            recurDuration === "count"
              ? addMonthsISO(nextStart, total - 2)
              : undefined,
        });
      }
    }
    // reset for fast repeated entry
    setTitle("");
    setAmount("");
    setNote("");
    setMakeRecurring(false);
    setRecurDuration("forever");
    setRecurMonths("12");
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 2600);
  }

  const lastAdded = recent(expenses, 2);

  return (
    <AppShell title="הוספת הוצאה">
      {/* QUICK ENTRY */}
      <div className="card">
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>⚡ הזנה מהירה</span>
          <span className="tiny muted">כתוב משפט — נמלא את השאר</span>
        </div>
        <div className="quick">
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyQuick()}
            placeholder="לדוגמה: קפה 18"
            dir="rtl"
          />
          <button className="go" onClick={applyQuick} aria-label="החל">
            ↵
          </button>
        </div>
        {(parsed.title || parsed.amount != null) && (
          <div className="parse">
            זוהה:
            {parsed.title && <span className="tag">{parsed.title}</span>}
            {parsed.amount != null && (
              <span className="tag">{formatMoney(parsed.amount)}</span>
            )}
          </div>
        )}
      </div>

      <div className="row" style={{ margin: "20px 4px", gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span className="tiny muted">או מלא ידנית</span>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>

      {/* FULL FORM */}
      <div className="card">
        <div className="field" style={{ marginTop: 0 }}>
          <label>סכום</label>
          <div className="with-cur">
            <input
              className="input input-lg tnum"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
            />
            <span className="cur">₪</span>
          </div>
        </div>

        <div className="field">
          <label>כותרת</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="לדוגמה: קפה"
          />
        </div>

        <div className="field">
          <label>קטגוריה</label>
          <div className="chips">
            {CATEGORIES.map((c) => {
              const active = c.id === categoryId;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip${active ? " accent active" : ""}`}
                  onClick={() => setCategoryId(c.id)}
                >
                  <span
                    className="sw"
                    style={{ background: active ? "#fff" : c.color }}
                  />
                  {c.he}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label>אמצעי תשלום</label>
          <div className="chips">
            {PAYMENT_METHODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip${p.id === paymentMethodId ? " active" : ""}`}
                onClick={() => setPaymentMethodId(p.id)}
              >
                {p.he}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>תאריך</label>
            <input
              type="date"
              className="input tnum"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>שעה</label>
            <input
              type="time"
              className="input tnum"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>הערה (לא חובה)</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הוסף הערה…"
          />
        </div>

        <div className="field">
          <button
            type="button"
            className={`recur-toggle${makeRecurring ? " on" : ""}`}
            onClick={toggleRecurring}
            aria-pressed={makeRecurring}
          >
            <span className="box">{makeRecurring ? "✓" : ""}</span>
            <span className="meta">
              <span className="t">🔁 הוצאה קבועה כל חודש</span>
              <span className="s">
                {makeRecurring
                  ? "נרשם החודש, ויחזור אוטומטית מהחודש הבא"
                  : "תירשם אוטומטית בכל חודש"}
              </span>
            </span>
          </button>

          {makeRecurring && (
            <div className="recur-panel">
              <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
                <div className="field" style={{ marginTop: 0, flex: "0 0 110px" }}>
                  <label>יום החיוב</label>
                  <input
                    className="input tnum"
                    value={recurDay}
                    onChange={(e) =>
                      setRecurDay(e.target.value.replace(/[^\d]/g, "").slice(0, 2))
                    }
                    inputMode="numeric"
                    placeholder="1"
                  />
                </div>
                <div className="tiny muted" style={{ paddingBottom: 14 }}>
                  בכל חודש (1–28)
                </div>
              </div>

              <div className="field">
                <label>משך</label>
                <div className="chips">
                  <button
                    type="button"
                    className={`chip${recurDuration === "forever" ? " accent active" : ""}`}
                    onClick={() => setRecurDuration("forever")}
                  >
                    ללא הגבלה
                  </button>
                  <button
                    type="button"
                    className={`chip${recurDuration === "count" ? " accent active" : ""}`}
                    onClick={() => setRecurDuration("count")}
                  >
                    מספר חודשים
                  </button>
                </div>
                {recurDuration === "count" && (
                  <div className="row" style={{ gap: 10, marginTop: 12 }}>
                    <input
                      className="input tnum"
                      style={{ maxWidth: 110 }}
                      value={recurMonths}
                      onChange={(e) =>
                        setRecurMonths(e.target.value.replace(/[^\d]/g, "").slice(0, 3))
                      }
                      inputMode="numeric"
                    />
                    <span className="muted tiny">חודשים בסך הכול (כולל החודש הזה)</span>
                  </div>
                )}
              </div>

              <div className="tiny muted" style={{ marginTop: 6 }}>
                לעריכה או השהיה בהמשך — ראה{" "}
                <a href="/recurring" style={{ color: "var(--accent)", fontWeight: 700 }}>
                  ניהול הוצאות קבועות
                </a>
                .
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 22 }} />
        <button className="btn" onClick={submit} disabled={!canSubmit}>
          הוסף הוצאה
        </button>
      </div>

      {showToast && (
        <div style={{ marginTop: 16 }}>
          <div className="toast">
            <span className="ok">✓</span> ההוצאה נוספה בהצלחה — אפשר להוסיף עוד
          </div>
        </div>
      )}

      {lastAdded.length > 0 && (
        <>
          <div className="section-h">
            <h3>נוספו לאחרונה</h3>
          </div>
          <div className="exp-list">
            {lastAdded.map((e) => {
              const cat = getCategory(e.categoryId);
              return (
                <div className="exp" key={e.id}>
                  <span className="ic" style={{ background: cat.color }}>
                    {cat.icon}
                  </span>
                  <div className="meta">
                    <div className="t">{e.title}</div>
                    <div className="s">
                      {cat.he} · {relativeDayLabel(e.date)} {formatTime(e.date)}
                    </div>
                  </div>
                  <span className="amt tnum">{formatMoney(e.amount)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
