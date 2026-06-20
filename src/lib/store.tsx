"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isSupabaseConfigured } from "./supabase/config";
import { createClient as createBrowserSupabase } from "./supabase/client";

// ── Types ──────────────────────────────────────────────
export type Expense = {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  paymentMethodId?: string;
  note?: string;
  date: string; // ISO
  recurringId?: string; // set when auto-posted from a recurring rule
};

export type ExpenseInput = {
  title: string;
  amount: number;
  categoryId: string;
  paymentMethodId?: string;
  note?: string;
  date?: string; // defaults to now
  recurringId?: string;
};

export type Recurring = {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  paymentMethodId?: string;
  note?: string;
  dayOfMonth: number; // 1–28
  startMonth: string; // ISO date, first of month ("YYYY-MM-01")
  endMonth?: string; // ISO date, first of month; undefined = indefinite
  active: boolean;
};

export type RecurringInput = {
  title: string;
  amount: number;
  categoryId: string;
  paymentMethodId?: string;
  note?: string;
  dayOfMonth: number;
  startMonth?: string; // defaults to the current month
  endMonth?: string; // undefined = indefinite
  active?: boolean; // defaults to true
};

const STORAGE_KEY = "moneytalk:expenses";
const RECURRING_KEY = "moneytalk:recurring";
const BUDGET_KEY = "moneytalk:budget";
const DEFAULT_BUDGET = 6000;

// ── id + month helpers ─────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** "YYYY-MM" key for a date. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** ISO date string for the first day of a date's month ("YYYY-MM-01"). */
export function firstOfMonthISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── recurring auto-posting (pure) ──────────────────────
// For one rule, return the expenses that should exist by `now` but don't yet.
// A month M is posted on its `dayOfMonth`; we never post a future-dated month
// and never re-post a month that already has a row for this rule.
function duePostings(
  rule: Recurring,
  existing: Expense[],
  now: Date,
  newId: () => string
): Expense[] {
  if (!rule.active) return [];

  const posted = new Set(
    existing
      .filter((e) => e.recurringId === rule.id)
      .map((e) => monthKey(new Date(e.date)))
  );

  // Iterate by month from start to end (or now). Clamp the start to ~24 months
  // back so an old indefinite rule still reaches the current month within the
  // guard, and cap total iterations as a safety net.
  const start = new Date(rule.startMonth);
  const floor = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  let y = start > floor ? start.getFullYear() : floor.getFullYear();
  let m = start > floor ? start.getMonth() : floor.getMonth();

  const end = rule.endMonth ? new Date(rule.endMonth) : null;
  const out: Expense[] = [];

  for (let guard = 0; guard < 25; guard++) {
    // Past the active window's end?
    if (end && (y > end.getFullYear() || (y === end.getFullYear() && m > end.getMonth())))
      break;
    // Past the current month?
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth()))
      break;

    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    if (!posted.has(key)) {
      const postDate = new Date(y, m, rule.dayOfMonth, 9, 0, 0, 0);
      if (postDate.getTime() <= now.getTime()) {
        out.push({
          id: newId(),
          title: rule.title,
          amount: rule.amount,
          categoryId: rule.categoryId,
          paymentMethodId: rule.paymentMethodId,
          note: rule.note,
          date: postDate.toISOString(),
          recurringId: rule.id,
        });
      }
    }

    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

const byDateDesc = (a: Expense, b: Expense) => b.date.localeCompare(a.date);

// ── demo seed (localStorage mode only) ─────────────────
function seedExpenses(): Expense[] {
  const now = new Date();
  const at = (daysAgo: number, h: number, m: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const rows: Omit<Expense, "id">[] = [
    { title: "קפה ומאפה", amount: 38, categoryId: "restaurants", paymentMethodId: "credit", date: at(0, 14, 30) },
    { title: "סופרמרקט", amount: 214, categoryId: "shopping", paymentMethodId: "credit", date: at(0, 11, 5) },
    { title: "רב‑קו", amount: 12, categoryId: "transit", paymentMethodId: "bit", date: at(1, 8, 12) },
    { title: "קולנוע", amount: 56, categoryId: "fun", paymentMethodId: "credit", date: at(1, 21, 0) },
    { title: "פירות וירקות", amount: 73, categoryId: "food", paymentMethodId: "cash", date: at(2, 17, 40) },
    { title: "דלק", amount: 280, categoryId: "car", paymentMethodId: "credit", date: at(3, 9, 20) },
    { title: "ארוחת צהריים", amount: 64, categoryId: "restaurants", paymentMethodId: "credit", date: at(4, 13, 15) },
    { title: "חדר כושר", amount: 199, categoryId: "sport", paymentMethodId: "credit", date: at(5, 7, 30) },
    { title: "תרופות", amount: 45, categoryId: "health", paymentMethodId: "cash", date: at(6, 18, 0) },
    { title: "ביגוד", amount: 320, categoryId: "shopping", paymentMethodId: "credit", date: at(8, 16, 45) },
  ];
  return rows.map((r) => ({ ...r, id: uid() }));
}

// Rent is seeded as a real recurring rule so demo mode showcases the feature:
// the auto-poster creates this month's "שכר דירה" row on load.
function seedRecurring(): Recurring[] {
  const now = new Date();
  return [
    {
      id: uid(),
      title: "שכר דירה",
      amount: 4200,
      categoryId: "home",
      paymentMethodId: "transfer",
      note: "הוצאה קבועה",
      dayOfMonth: 1,
      startMonth: firstOfMonthISO(now),
      active: true,
    },
  ];
}

// ── DB row mapping (Supabase mode) ─────────────────────
type ExpenseRow = {
  id: string;
  title: string;
  amount: number | string;
  category_id: string;
  payment_method_id: string | null;
  note: string | null;
  date: string;
  recurring_id: string | null;
};

function fromRow(r: ExpenseRow): Expense {
  return {
    id: r.id,
    title: r.title,
    amount: Number(r.amount),
    categoryId: r.category_id,
    paymentMethodId: r.payment_method_id ?? undefined,
    note: r.note ?? undefined,
    date: r.date,
    recurringId: r.recurring_id ?? undefined,
  };
}

function toRow(e: Expense) {
  return {
    id: e.id,
    title: e.title,
    amount: e.amount,
    category_id: e.categoryId,
    payment_method_id: e.paymentMethodId ?? null,
    note: e.note ?? null,
    date: e.date,
    recurring_id: e.recurringId ?? null,
  };
}

type RecurringRow = {
  id: string;
  title: string;
  amount: number | string;
  category_id: string;
  payment_method_id: string | null;
  note: string | null;
  day_of_month: number;
  start_month: string;
  end_month: string | null;
  active: boolean;
};

function fromRecurringRow(r: RecurringRow): Recurring {
  return {
    id: r.id,
    title: r.title,
    amount: Number(r.amount),
    categoryId: r.category_id,
    paymentMethodId: r.payment_method_id ?? undefined,
    note: r.note ?? undefined,
    dayOfMonth: r.day_of_month,
    startMonth: r.start_month,
    endMonth: r.end_month ?? undefined,
    active: r.active,
  };
}

function toRecurringRow(r: Recurring) {
  return {
    id: r.id,
    title: r.title,
    amount: r.amount,
    category_id: r.categoryId,
    payment_method_id: r.paymentMethodId ?? null,
    note: r.note ?? null,
    day_of_month: r.dayOfMonth,
    start_month: r.startMonth,
    end_month: r.endMonth ?? null,
    active: r.active,
  };
}

// ── Context ────────────────────────────────────────────
type StoreValue = {
  expenses: Expense[];
  recurring: Recurring[];
  loaded: boolean;
  monthlyBudget: number;
  setMonthlyBudget: (amount: number) => void;
  addExpense: (input: ExpenseInput) => void;
  deleteExpense: (id: string) => void;
  addRecurring: (input: RecurringInput) => void;
  updateRecurring: (id: string, patch: Partial<RecurringInput>) => void;
  deleteRecurring: (id: string) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // One browser Supabase client for the app's lifetime (null in demo mode).
  const supabase = useMemo(
    () => (isSupabaseConfigured() ? createBrowserSupabase() : null),
    []
  );
  const cloud = supabase !== null;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [monthlyBudget, setBudgetState] = useState<number>(DEFAULT_BUDGET);
  const [loaded, setLoaded] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const newId = useCallback(
    () => (cloud ? crypto.randomUUID() : uid()),
    [cloud]
  );

  // Persist generated (auto-posted) recurring rows. Updates local state and,
  // in cloud mode, inserts the rows. Returns nothing; rollback on error.
  const commitGenerated = useCallback(
    (rows: Expense[]) => {
      if (rows.length === 0) return;
      setExpenses((prev) => [...rows, ...prev].sort(byDateDesc));
      if (cloud && supabase) {
        supabase
          .from("expenses")
          .insert(rows.map(toRow))
          .then(({ error }) => {
            if (error) {
              console.error("recurring auto-post failed", error.message);
              const ids = new Set(rows.map((r) => r.id));
              setExpenses((prev) => prev.filter((e) => !ids.has(e.id)));
            }
          });
      }
    },
    [cloud, supabase]
  );

  // ── Load ──
  useEffect(() => {
    let active = true;

    // Cloud mode: pull the signed-in user's rows from Supabase.
    if (cloud && supabase) {
      const load = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userIdRef.current = user?.id ?? null;

        if (!user) {
          if (active) {
            setExpenses([]);
            setRecurring([]);
            setLoaded(true);
          }
          return;
        }

        const [{ data: rows }, { data: budget }, { data: recRows }] =
          await Promise.all([
            supabase.from("expenses").select("*").order("date", { ascending: false }),
            supabase.from("budgets").select("monthly_amount").maybeSingle(),
            supabase.from("recurring_expenses").select("*"),
          ]);

        if (!active) return;
        const loadedExpenses = (rows ?? []).map((r) => fromRow(r as ExpenseRow));
        const loadedRecurring = (recRows ?? []).map((r) =>
          fromRecurringRow(r as RecurringRow)
        );
        setExpenses(loadedExpenses);
        setRecurring(loadedRecurring);
        if (budget) setBudgetState(Number(budget.monthly_amount) || DEFAULT_BUDGET);
        setLoaded(true);

        // Catch up any recurring expenses due since the last visit.
        const now = new Date();
        const due = loadedRecurring.flatMap((rule) =>
          duePostings(rule, loadedExpenses, now, newId)
        );
        commitGenerated(due);
      };

      load();

      // Re-load on sign-in, clear on sign-out.
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          userIdRef.current = null;
          setExpenses([]);
          setRecurring([]);
          setBudgetState(DEFAULT_BUDGET);
        } else if (event === "SIGNED_IN") {
          load();
        }
      });

      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    }

    // Demo mode: localStorage, seeded on first run.
    let loadedExpenses: Expense[];
    let loadedRecurring: Recurring[];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      loadedExpenses = raw ? (JSON.parse(raw) as Expense[]) : seedExpenses();

      const rawRec = localStorage.getItem(RECURRING_KEY);
      if (rawRec) {
        loadedRecurring = JSON.parse(rawRec) as Recurring[];
      } else {
        loadedRecurring = seedRecurring();
        localStorage.setItem(RECURRING_KEY, JSON.stringify(loadedRecurring));
      }
      if (!raw) localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedExpenses));

      const b = localStorage.getItem(BUDGET_KEY);
      if (b != null) setBudgetState(Number(b) || DEFAULT_BUDGET);
    } catch {
      loadedExpenses = seedExpenses();
      loadedRecurring = seedRecurring();
    }

    setExpenses(loadedExpenses);
    setRecurring(loadedRecurring);
    setLoaded(true);

    const now = new Date();
    const due = loadedRecurring.flatMap((rule) =>
      duePostings(rule, loadedExpenses, now, newId)
    );
    commitGenerated(due);

    return () => {
      active = false;
    };
  }, [cloud, supabase, newId, commitGenerated]);

  // Persist to localStorage (demo mode only).
  useEffect(() => {
    if (loaded && !cloud) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
      } catch {
        /* ignore quota / private-mode errors */
      }
    }
  }, [expenses, loaded, cloud]);

  useEffect(() => {
    if (loaded && !cloud) {
      try {
        localStorage.setItem(RECURRING_KEY, JSON.stringify(recurring));
      } catch {
        /* ignore */
      }
    }
  }, [recurring, loaded, cloud]);

  const setMonthlyBudget = useCallback(
    (amount: number) => {
      const value = Math.max(0, Math.round(amount));
      setBudgetState(value);
      if (cloud && supabase) {
        supabase
          .from("budgets")
          .upsert({ monthly_amount: value }, { onConflict: "user_id" })
          .then(({ error }) => {
            if (error) console.error("budget save failed", error.message);
          });
      } else {
        try {
          localStorage.setItem(BUDGET_KEY, String(value));
        } catch {
          /* ignore */
        }
      }
    },
    [cloud, supabase]
  );

  const addExpense = useCallback(
    (input: ExpenseInput) => {
      const expense: Expense = {
        id: newId(),
        title: input.title.trim(),
        amount: input.amount,
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethodId,
        note: input.note?.trim() || undefined,
        date: input.date ?? new Date().toISOString(),
        recurringId: input.recurringId,
      };
      // Optimistic insert.
      setExpenses((prev) => [expense, ...prev].sort(byDateDesc));

      if (cloud && supabase) {
        supabase
          .from("expenses")
          .insert(toRow(expense))
          .then(({ error }) => {
            if (error) {
              console.error("expense save failed", error.message);
              // Roll back the optimistic row.
              setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
            }
          });
      }
    },
    [cloud, supabase, newId]
  );

  const deleteExpense = useCallback(
    (id: string) => {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      if (cloud && supabase) {
        supabase
          .from("expenses")
          .delete()
          .eq("id", id)
          .then(({ error }) => {
            if (error) console.error("expense delete failed", error.message);
          });
      }
    },
    [cloud, supabase]
  );

  const addRecurring = useCallback(
    (input: RecurringInput) => {
      const now = new Date();
      const rule: Recurring = {
        id: newId(),
        title: input.title.trim(),
        amount: input.amount,
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethodId,
        note: input.note?.trim() || undefined,
        dayOfMonth: Math.min(28, Math.max(1, Math.round(input.dayOfMonth))),
        startMonth: input.startMonth ?? firstOfMonthISO(now),
        endMonth: input.endMonth,
        active: input.active ?? true,
      };
      setRecurring((prev) => [...prev, rule]);

      if (cloud && supabase) {
        supabase
          .from("recurring_expenses")
          .insert(toRecurringRow(rule))
          .then(({ error }) => {
            if (error) {
              console.error("recurring save failed", error.message);
              setRecurring((prev) => prev.filter((r) => r.id !== rule.id));
            }
          });
      }

      // Post immediately for any already-due months (e.g. this month).
      setExpenses((prevExpenses) => {
        const due = duePostings(rule, prevExpenses, now, newId);
        if (due.length === 0) return prevExpenses;
        if (cloud && supabase) {
          supabase
            .from("expenses")
            .insert(due.map(toRow))
            .then(({ error }) => {
              if (error) console.error("recurring auto-post failed", error.message);
            });
        }
        return [...due, ...prevExpenses].sort(byDateDesc);
      });
    },
    [cloud, supabase, newId]
  );

  const updateRecurring = useCallback(
    (id: string, patch: Partial<RecurringInput>) => {
      setRecurring((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          return {
            ...r,
            ...patch,
            title: patch.title !== undefined ? patch.title.trim() : r.title,
            note:
              patch.note !== undefined ? patch.note.trim() || undefined : r.note,
            dayOfMonth:
              patch.dayOfMonth !== undefined
                ? Math.min(28, Math.max(1, Math.round(patch.dayOfMonth)))
                : r.dayOfMonth,
          };
        })
      );

      if (cloud && supabase) {
        const row: Record<string, unknown> = {};
        if (patch.title !== undefined) row.title = patch.title.trim();
        if (patch.amount !== undefined) row.amount = patch.amount;
        if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
        if (patch.paymentMethodId !== undefined)
          row.payment_method_id = patch.paymentMethodId ?? null;
        if (patch.note !== undefined) row.note = patch.note.trim() || null;
        if (patch.dayOfMonth !== undefined)
          row.day_of_month = Math.min(28, Math.max(1, Math.round(patch.dayOfMonth)));
        if (patch.startMonth !== undefined) row.start_month = patch.startMonth;
        if (patch.endMonth !== undefined) row.end_month = patch.endMonth ?? null;
        if (patch.active !== undefined) row.active = patch.active;
        if (Object.keys(row).length > 0) {
          supabase
            .from("recurring_expenses")
            .update(row)
            .eq("id", id)
            .then(({ error }) => {
              if (error) console.error("recurring update failed", error.message);
            });
        }
      }
    },
    [cloud, supabase]
  );

  const deleteRecurring = useCallback(
    (id: string) => {
      setRecurring((prev) => prev.filter((r) => r.id !== id));
      // Generated expenses are kept (they become ordinary one-offs); just drop
      // the back-link so nothing dangles.
      setExpenses((prev) =>
        prev.map((e) => (e.recurringId === id ? { ...e, recurringId: undefined } : e))
      );
      if (cloud && supabase) {
        supabase
          .from("recurring_expenses")
          .delete()
          .eq("id", id)
          .then(({ error }) => {
            if (error) console.error("recurring delete failed", error.message);
          });
      }
    },
    [cloud, supabase]
  );

  const value = useMemo<StoreValue>(
    () => ({
      expenses,
      recurring,
      loaded,
      monthlyBudget,
      setMonthlyBudget,
      addExpense,
      deleteExpense,
      addRecurring,
      updateRecurring,
      deleteRecurring,
    }),
    [
      expenses,
      recurring,
      loaded,
      monthlyBudget,
      setMonthlyBudget,
      addExpense,
      deleteExpense,
      addRecurring,
      updateRecurring,
      deleteRecurring,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
