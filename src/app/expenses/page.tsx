"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { useStore, type Expense } from "@/lib/store";
import { CATEGORIES, getCategory } from "@/lib/categories";
import { getPaymentMethod } from "@/lib/payment-methods";
import {
  formatMoney,
  formatTime,
  relativeDayLabel,
  hebrewMonth,
} from "@/lib/format";
import { inMonth } from "@/lib/selectors";

type Sort = "newest" | "oldest" | "highest" | "lowest";

const SORT_LABEL: Record<Sort, string> = {
  newest: "החדש ביותר",
  oldest: "הישן ביותר",
  highest: "הסכום הגבוה",
  lowest: "הסכום הנמוך",
};

const SORT_CYCLE: Sort[] = ["newest", "oldest", "highest", "lowest"];

export default function ExpensesPage() {
  const { expenses, loaded, deleteExpense } = useStore();
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");

  const filtered = useMemo(() => {
    // The everyday list shows only the current month — past months live in
    // Reports. Recurring expenses re-appear here because they're re-posted each
    // month, so the list reads as a fresh slate on the 1st.
    let list = expenses.filter((e) => inMonth(e, new Date()));
    if (query.trim()) {
      const q = query.trim();
      list = list.filter((e) => e.title.includes(q));
    }
    if (catFilter) list = list.filter((e) => e.categoryId === catFilter);
    const sorted = [...list];
    switch (sort) {
      case "newest":
        sorted.sort((a, b) => b.date.localeCompare(a.date));
        break;
      case "oldest":
        sorted.sort((a, b) => a.date.localeCompare(b.date));
        break;
      case "highest":
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      case "lowest":
        sorted.sort((a, b) => a.amount - b.amount);
        break;
    }
    return sorted;
  }, [expenses, query, catFilter, sort]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const now = new Date();
  const byDate = sort === "newest" || sort === "oldest";

  // group by day label when sorting by date
  const groups = useMemo(() => {
    if (!byDate) return [{ label: "", items: filtered }];
    const map = new Map<string, Expense[]>();
    for (const e of filtered) {
      const key = relativeDayLabel(e.date);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  }, [filtered, byDate]);

  function cycleSort() {
    setSort((s) => SORT_CYCLE[(SORT_CYCLE.indexOf(s) + 1) % SORT_CYCLE.length]);
  }

  return (
    <AppShell
      title="הוצאות"
      subtitle={`${hebrewMonth(now.getMonth())} ${now.getFullYear()} · ${
        filtered.length
      } הוצאות · ${formatMoney(total)}`}
    >
      {/* search */}
      <div className="search">
        <span>🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם…"
        />
      </div>

      {/* category filter */}
      <div
        className="chips"
        style={{ marginTop: 12, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4 }}
      >
        <button
          className={`chip${catFilter === null ? " active" : ""}`}
          onClick={() => setCatFilter(null)}
        >
          הכול
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`chip${catFilter === c.id ? " active" : ""}`}
            onClick={() => setCatFilter(c.id)}
            style={{ whiteSpace: "nowrap" }}
          >
            <span className="sw" style={{ background: c.color }} />
            {c.he}
          </button>
        ))}
      </div>

      {/* sort */}
      <div className="row" style={{ marginTop: 12 }}>
        <span className="tiny muted">{filtered.length} תוצאות</span>
        <button className="sort" style={{ marginInlineStart: "auto" }} onClick={cycleSort}>
          מיון: {SORT_LABEL[sort]} ⌄
        </button>
      </div>

      {/* list */}
      {!loaded ? null : filtered.length === 0 ? (
        <div className="empty">
          <div className="em">🧾</div>
          <div className="t">לא נמצאו הוצאות</div>
          <div className="s">נסה לשנות את החיפוש או הסינון, או הוסף הוצאה חדשה.</div>
        </div>
      ) : (
        groups.map((g, i) => (
          <div key={g.label || i}>
            {g.label && <div className="day-h">{g.label}</div>}
            <div className="exp-list">
              {g.items.map((e) => {
                const cat = getCategory(e.categoryId);
                const pm = getPaymentMethod(e.paymentMethodId);
                const isFixed = Boolean(e.recurringId) || e.note === "הוצאה קבועה";
                return (
                  <div className="exp" key={e.id}>
                    <span className="ic" style={{ background: cat.color }}>
                      {cat.icon}
                    </span>
                    <div className="meta">
                      <div className="t">{e.title}</div>
                      <div className="s">
                        {cat.he}
                        {isFixed
                          ? " · הוצאה קבועה"
                          : ` · ${formatTime(e.date)}`}
                        {pm && ` · ${pm.he}`}
                      </div>
                    </div>
                    <span className={`amt tnum${isFixed ? " fixed" : ""}`}>
                      {formatMoney(e.amount)}
                    </span>
                    <button
                      className="del"
                      aria-label="מחיקה"
                      onClick={() => deleteExpense(e.id)}
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: 22 }}>
        <Link href="/expenses/new" className="btn">
          הוסף הוצאה
        </Link>
      </div>
    </AppShell>
  );
}
