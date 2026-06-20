"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useStore, firstOfMonthISO, type Recurring } from "@/lib/store";
import { CATEGORIES, getCategory } from "@/lib/categories";
import { PAYMENT_METHODS, getPaymentMethod } from "@/lib/payment-methods";
import { formatMoney, hebrewMonth } from "@/lib/format";

type DurationMode = "forever" | "count";

function addMonthsISO(startISO: string, n: number): string {
  const d = new Date(startISO);
  return firstOfMonthISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/** Inclusive month count between two first-of-month ISO dates. */
function monthsInclusive(startISO: string, endISO: string): number {
  const s = new Date(startISO);
  const e = new Date(endISO);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

function durationLabel(r: Recurring): string {
  if (!r.endMonth) return "ללא הגבלה";
  const e = new Date(r.endMonth);
  return `עד ${hebrewMonth(e.getMonth())} ${e.getFullYear()}`;
}

const EMPTY_FORM = {
  title: "",
  amount: "",
  categoryId: "home",
  paymentMethodId: "credit",
  dayOfMonth: "1",
  durationMode: "forever" as DurationMode,
  months: "12",
  note: "",
};

export default function RecurringPage() {
  const { recurring, loaded, addRecurring, updateRecurring, deleteRecurring } =
    useStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const sorted = useMemo(
    () =>
      [...recurring].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.dayOfMonth - b.dayOfMonth;
      }),
    [recurring]
  );

  const monthlyTotal = recurring
    .filter((r) => r.active)
    .reduce((s, r) => s + r.amount, 0);

  const isOpen = adding || editingId !== null;

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAdding(true);
  }

  function openEdit(r: Recurring) {
    const months =
      r.endMonth != null ? monthsInclusive(r.startMonth, r.endMonth) : 12;
    setForm({
      title: r.title,
      amount: String(r.amount),
      categoryId: r.categoryId,
      paymentMethodId: r.paymentMethodId ?? "credit",
      dayOfMonth: String(r.dayOfMonth),
      durationMode: r.endMonth != null ? "count" : "forever",
      months: String(Math.max(1, months)),
      note: r.note ?? "",
    });
    setAdding(false);
    setEditingId(r.id);
  }

  function close() {
    setAdding(false);
    setEditingId(null);
  }

  const canSave = form.title.trim() !== "" && Number(form.amount) > 0;

  function save() {
    if (!canSave) return;
    const day = Math.min(28, Math.max(1, Number(form.dayOfMonth) || 1));
    const monthsN = Math.max(1, Number(form.months) || 1);

    if (editingId) {
      const rule = recurring.find((r) => r.id === editingId);
      const startMonth = rule?.startMonth ?? firstOfMonthISO(new Date());
      updateRecurring(editingId, {
        title: form.title,
        amount: Number(form.amount),
        categoryId: form.categoryId,
        paymentMethodId: form.paymentMethodId,
        note: form.note,
        dayOfMonth: day,
        endMonth:
          form.durationMode === "count"
            ? addMonthsISO(startMonth, monthsN - 1)
            : undefined,
      });
    } else {
      const startMonth = firstOfMonthISO(new Date());
      addRecurring({
        title: form.title,
        amount: Number(form.amount),
        categoryId: form.categoryId,
        paymentMethodId: form.paymentMethodId,
        note: form.note,
        dayOfMonth: day,
        startMonth,
        endMonth:
          form.durationMode === "count"
            ? addMonthsISO(startMonth, monthsN - 1)
            : undefined,
      });
    }
    close();
  }

  function remove(r: Recurring) {
    if (confirm(`למחוק את ההוצאה הקבועה "${r.title}"?`)) {
      deleteRecurring(r.id);
      if (editingId === r.id) close();
    }
  }

  return (
    <AppShell
      title="הוצאות קבועות"
      subtitle={
        recurring.length > 0
          ? `${recurring.filter((r) => r.active).length} פעילות · ${formatMoney(
              monthlyTotal
            )} לחודש`
          : "הוצאות שחוזרות מדי חודש — שכר דירה, מנויים ועוד"
      }
    >
      {/* editor */}
      {isOpen && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="field" style={{ marginTop: 0 }}>
            <label>סכום</label>
            <div className="with-cur">
              <input
                className="input input-lg tnum"
                value={form.amount}
                onChange={(e) =>
                  setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })
                }
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
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="לדוגמה: שכר דירה"
            />
          </div>

          <div className="field">
            <label>קטגוריה</label>
            <div className="chips">
              {CATEGORIES.map((c) => {
                const activeChip = c.id === form.categoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip${activeChip ? " accent active" : ""}`}
                    onClick={() => setForm({ ...form, categoryId: c.id })}
                  >
                    <span
                      className="sw"
                      style={{ background: activeChip ? "#fff" : c.color }}
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
                  className={`chip${p.id === form.paymentMethodId ? " active" : ""}`}
                  onClick={() => setForm({ ...form, paymentMethodId: p.id })}
                >
                  {p.he}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>יום החיוב בחודש</label>
            <input
              className="input tnum"
              value={form.dayOfMonth}
              onChange={(e) =>
                setForm({
                  ...form,
                  dayOfMonth: e.target.value.replace(/[^\d]/g, "").slice(0, 2),
                })
              }
              inputMode="numeric"
              placeholder="1"
            />
            <div className="tiny muted" style={{ marginTop: 6 }}>
              בין 1 ל‑28 (כדי לא לדלג על חודשים קצרים).
            </div>
          </div>

          <div className="field">
            <label>משך</label>
            <div className="chips">
              <button
                type="button"
                className={`chip${form.durationMode === "forever" ? " accent active" : ""}`}
                onClick={() => setForm({ ...form, durationMode: "forever" })}
              >
                ללא הגבלה
              </button>
              <button
                type="button"
                className={`chip${form.durationMode === "count" ? " accent active" : ""}`}
                onClick={() => setForm({ ...form, durationMode: "count" })}
              >
                מספר חודשים
              </button>
            </div>
            {form.durationMode === "count" && (
              <div className="row" style={{ gap: 10, marginTop: 12 }}>
                <input
                  className="input tnum"
                  style={{ maxWidth: 110 }}
                  value={form.months}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      months: e.target.value.replace(/[^\d]/g, "").slice(0, 3),
                    })
                  }
                  inputMode="numeric"
                />
                <span className="muted tiny">חודשים מהחודש הנוכחי</span>
              </div>
            )}
          </div>

          <div className="field">
            <label>הערה (לא חובה)</label>
            <input
              className="input"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="הוסף הערה…"
            />
          </div>

          <div className="row" style={{ gap: 10, marginTop: 22 }}>
            <button className="btn" onClick={save} disabled={!canSave}>
              {editingId ? "שמירת שינויים" : "הוספת הוצאה קבועה"}
            </button>
            <button className="btn ghost" style={{ width: "auto", padding: "16px 20px" }} onClick={close}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {!isOpen && (
        <button className="btn" onClick={openAdd} style={{ marginBottom: 18 }}>
          + הוספת הוצאה קבועה
        </button>
      )}

      {/* list */}
      {!loaded ? null : sorted.length === 0 ? (
        <div className="empty">
          <div className="em">🔁</div>
          <div className="t">אין עדיין הוצאות קבועות</div>
          <div className="s">
            הגדר הוצאה שחוזרת מדי חודש (שכר דירה, מנוי, ביטוח) והיא תירשם אוטומטית.
          </div>
        </div>
      ) : (
        <div className="exp-list">
          {sorted.map((r) => {
            const cat = getCategory(r.categoryId);
            const pm = getPaymentMethod(r.paymentMethodId);
            return (
              <div
                className="exp"
                key={r.id}
                style={{ opacity: r.active ? 1 : 0.5 }}
              >
                <span className="ic" style={{ background: cat.color }}>
                  {cat.icon}
                </span>
                <div className="meta">
                  <div className="t">{r.title}</div>
                  <div className="s">
                    כל {r.dayOfMonth} בחודש · {durationLabel(r)}
                    {pm && ` · ${pm.he}`}
                    {!r.active && " · מושהית"}
                  </div>
                </div>
                <span className="amt tnum">{formatMoney(r.amount)}</span>
                <button
                  className="del"
                  aria-label={r.active ? "השהיה" : "הפעלה"}
                  title={r.active ? "השהיה" : "הפעלה"}
                  onClick={() => updateRecurring(r.id, { active: !r.active })}
                  style={{ opacity: 1 }}
                >
                  {r.active ? "⏸" : "▶"}
                </button>
                <button
                  className="del"
                  aria-label="עריכה"
                  title="עריכה"
                  onClick={() => openEdit(r)}
                  style={{ opacity: 1 }}
                >
                  ✏️
                </button>
                <button
                  className="del"
                  aria-label="מחיקה"
                  title="מחיקה"
                  onClick={() => remove(r)}
                  style={{ opacity: 1 }}
                >
                  🗑
                </button>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
