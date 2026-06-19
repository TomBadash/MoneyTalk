"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { CATEGORIES, getCategory } from "@/lib/categories";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { parseQuickEntry } from "@/lib/parse-quick";
import { formatMoney, formatTime, relativeDayLabel } from "@/lib/format";
import { recent } from "@/lib/selectors";

export default function AddExpensePage() {
  const { expenses, addExpense } = useStore();

  const [quick, setQuick] = useState("");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("restaurants");
  const [paymentMethodId, setPaymentMethodId] = useState("credit");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [note, setNote] = useState("");
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
    // reset for fast repeated entry
    setTitle("");
    setAmount("");
    setNote("");
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
