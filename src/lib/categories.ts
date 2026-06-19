// The 14 default expense categories (PRD §10), Hebrew labels, icon + color.
// Colors mirror the --c-* tokens in globals.css.

export type Category = {
  id: string;
  he: string;
  icon: string;
  color: string;
};

export const CATEGORIES: Category[] = [
  { id: "food", he: "אוכל", icon: "🍎", color: "#F59E0B" },
  { id: "restaurants", he: "מסעדות", icon: "🍽️", color: "#EF4444" },
  { id: "home", he: "דירה", icon: "🏠", color: "#6366F1" },
  { id: "car", he: "רכב", icon: "🚗", color: "#0EA5E9" },
  { id: "transit", he: "תחבורה", icon: "🚌", color: "#14B8A6" },
  { id: "health", he: "בריאות", icon: "⚕️", color: "#10B981" },
  { id: "sport", he: "ספורט", icon: "🏋️", color: "#84CC16" },
  { id: "fun", he: "בילויים", icon: "🎬", color: "#A855F7" },
  { id: "shopping", he: "קניות", icon: "🛍️", color: "#EC4899" },
  { id: "flights", he: "טיסות", icon: "✈️", color: "#06B6D4" },
  { id: "investments", he: "השקעות", icon: "📈", color: "#22C55E" },
  { id: "gifts", he: "מתנות", icon: "🎁", color: "#F43F5E" },
  { id: "education", he: "לימודים", icon: "📚", color: "#3B82F6" },
  { id: "other", he: "אחר", icon: "🧾", color: "#64748B" },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return BY_ID.get(id) ?? CATEGORIES[CATEGORIES.length - 1]; // fallback: "אחר"
}
