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
};

export type ExpenseInput = {
  title: string;
  amount: number;
  categoryId: string;
  paymentMethodId?: string;
  note?: string;
  date?: string; // defaults to now
};

const STORAGE_KEY = "moneytalk:expenses";
const BUDGET_KEY = "moneytalk:budget";
const DEFAULT_BUDGET = 6000;

// ── id + demo seed (localStorage mode only) ────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function seed(): Expense[] {
  const now = new Date();
  const at = (daysAgo: number, h: number, m: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 9, 0);

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
    { title: "שכר דירה", amount: 4200, categoryId: "home", paymentMethodId: "transfer", note: "הוצאה קבועה", date: firstOfMonth.toISOString() },
  ];
  return rows.map((r) => ({ ...r, id: uid() }));
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
  };
}

const byDateDesc = (a: Expense, b: Expense) => b.date.localeCompare(a.date);

// ── Context ────────────────────────────────────────────
type StoreValue = {
  expenses: Expense[];
  loaded: boolean;
  monthlyBudget: number;
  setMonthlyBudget: (amount: number) => void;
  addExpense: (input: ExpenseInput) => void;
  deleteExpense: (id: string) => void;
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
  const [monthlyBudget, setBudgetState] = useState<number>(DEFAULT_BUDGET);
  const [loaded, setLoaded] = useState(false);
  const userIdRef = useRef<string | null>(null);

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
            setLoaded(true);
          }
          return;
        }

        const [{ data: rows }, { data: budget }] = await Promise.all([
          supabase.from("expenses").select("*").order("date", { ascending: false }),
          supabase.from("budgets").select("monthly_amount").maybeSingle(),
        ]);

        if (!active) return;
        setExpenses((rows ?? []).map((r) => fromRow(r as ExpenseRow)));
        if (budget) setBudgetState(Number(budget.monthly_amount) || DEFAULT_BUDGET);
        setLoaded(true);
      };

      load();

      // Re-load on sign-in, clear on sign-out.
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          userIdRef.current = null;
          setExpenses([]);
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setExpenses(JSON.parse(raw) as Expense[]);
      } else {
        const s = seed();
        setExpenses(s);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      }
      const b = localStorage.getItem(BUDGET_KEY);
      if (b != null) setBudgetState(Number(b) || DEFAULT_BUDGET);
    } catch {
      setExpenses(seed());
    }
    setLoaded(true);
    return () => {
      active = false;
    };
  }, [cloud, supabase]);

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
        id: cloud ? crypto.randomUUID() : uid(),
        title: input.title.trim(),
        amount: input.amount,
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethodId,
        note: input.note?.trim() || undefined,
        date: input.date ?? new Date().toISOString(),
      };
      // Optimistic insert.
      setExpenses((prev) => [expense, ...prev].sort(byDateDesc));

      if (cloud && supabase) {
        supabase
          .from("expenses")
          .insert({
            id: expense.id,
            title: expense.title,
            amount: expense.amount,
            category_id: expense.categoryId,
            payment_method_id: expense.paymentMethodId ?? null,
            note: expense.note ?? null,
            date: expense.date,
          })
          .then(({ error }) => {
            if (error) {
              console.error("expense save failed", error.message);
              // Roll back the optimistic row.
              setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
            }
          });
      }
    },
    [cloud, supabase]
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

  const value = useMemo<StoreValue>(
    () => ({
      expenses,
      loaded,
      monthlyBudget,
      setMonthlyBudget,
      addExpense,
      deleteExpense,
    }),
    [expenses, loaded, monthlyBudget, setMonthlyBudget, addExpense, deleteExpense]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
