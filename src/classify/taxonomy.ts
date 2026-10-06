import type { CategoryNode, ConsumptionType, FinancialType } from "@/domain/types";

// Parent → Category → Subcategory. Seeded for every user (no manual setup required).
// Leaf = subcategory id. Colors map to the --c-* tokens in globals.css.

type Parent = { id: string; he: string; icon: string; color: string };
type Cat = { id: string; he: string; parent: string; consumption: ConsumptionType | null; financial?: FinancialType };
type Sub = { id: string; he: string; cat: string };

export const PARENTS: Parent[] = [
  { id: "p_food", he: "אוכל ושתייה", icon: "🍽️", color: "#F59E0B" },
  { id: "p_household", he: "משק בית", icon: "🛒", color: "#10B981" },
  { id: "p_housing", he: "דיור", icon: "🏠", color: "#6366F1" },
  { id: "p_transport", he: "תחבורה", icon: "🚗", color: "#0EA5E9" },
  { id: "p_lifestyle", he: "סגנון חיים", icon: "🛍️", color: "#EC4899" },
  { id: "p_health", he: "בריאות", icon: "⚕️", color: "#14B8A6" },
  { id: "p_comms", he: "תקשורת ומנויים", icon: "📱", color: "#A855F7" },
  { id: "p_income", he: "הכנסות", icon: "💼", color: "#22C55E" },
  { id: "p_wealth", he: "חיסכון והשקעות", icon: "📈", color: "#22C55E" },
  { id: "p_transfers", he: "העברות", icon: "🔁", color: "#64748B" },
  { id: "p_other", he: "אחר", icon: "🧾", color: "#64748B" },
];

export const CATS: Cat[] = [
  { id: "c_eating_out", he: "מסעדות וקפה", parent: "p_food", consumption: "lifestyle" },
  { id: "c_delivery", he: "משלוחים", parent: "p_food", consumption: "lifestyle" },
  { id: "c_bars", he: "ברים ובילויים", parent: "p_food", consumption: "lifestyle" },
  { id: "c_groceries", he: "מזון לבית", parent: "p_household", consumption: "variable_essential" },
  { id: "c_supplies", he: "ציוד לבית", parent: "p_household", consumption: "variable_essential" },
  { id: "c_rent", he: "שכר דירה", parent: "p_housing", consumption: "fixed" },
  { id: "c_arnona", he: "ארנונה", parent: "p_housing", consumption: "fixed" },
  { id: "c_utilities", he: "חשבונות בית", parent: "p_housing", consumption: "fixed" },
  { id: "c_furniture", he: "ריהוט וחשמל לבית", parent: "p_housing", consumption: "one_off" },
  { id: "c_fuel", he: "דלק", parent: "p_transport", consumption: "variable_essential" },
  { id: "c_parking", he: "חניה", parent: "p_transport", consumption: "variable_essential" },
  { id: "c_public", he: "תחבורה ציבורית ומוניות", parent: "p_transport", consumption: "variable_essential" },
  { id: "c_car", he: "רכב", parent: "p_transport", consumption: "one_off" },
  { id: "c_shopping", he: "קניות", parent: "p_lifestyle", consumption: "lifestyle" },
  { id: "c_entertainment", he: "בילויים ופנאי", parent: "p_lifestyle", consumption: "lifestyle" },
  { id: "c_travel", he: "טיסות ונופש", parent: "p_lifestyle", consumption: "one_off" },
  { id: "c_sport", he: "ספורט", parent: "p_lifestyle", consumption: "fixed" },
  { id: "c_electronics", he: "אלקטרוניקה", parent: "p_lifestyle", consumption: "one_off" },
  { id: "c_pharmacy", he: "פארם ובריאות", parent: "p_health", consumption: "variable_essential" },
  { id: "c_insurance", he: "ביטוח", parent: "p_health", consumption: "fixed" },
  { id: "c_cellular", he: "סלולר", parent: "p_comms", consumption: "fixed" },
  { id: "c_internet", he: "אינטרנט וטלוויזיה", parent: "p_comms", consumption: "fixed" },
  { id: "c_subscriptions", he: "מנויים", parent: "p_comms", consumption: "fixed" },
  { id: "c_salary", he: "משכורת", parent: "p_income", consumption: null, financial: "income" },
  { id: "c_other_income", he: "הכנסה אחרת", parent: "p_income", consumption: null, financial: "income" },
  { id: "c_savings", he: "חיסכון", parent: "p_wealth", consumption: null, financial: "savings" },
  { id: "c_investments", he: "השקעות", parent: "p_wealth", consumption: null, financial: "investment" },
  { id: "c_transfer", he: "העברה בין חשבונות", parent: "p_transfers", consumption: null, financial: "transfer" },
  { id: "c_card_bill", he: "חיוב כרטיס אשראי", parent: "p_transfers", consumption: null, financial: "transfer" },
  { id: "c_uncategorized", he: "לא מסווג", parent: "p_other", consumption: "variable_essential" },
];

export const SUBS: Sub[] = [
  { id: "s_coffee", he: "קפה", cat: "c_eating_out" },
  { id: "s_restaurant", he: "מסעדות", cat: "c_eating_out" },
  { id: "s_fastfood", he: "אוכל מהיר", cat: "c_eating_out" },
  { id: "s_delivery", he: "משלוחי אוכל", cat: "c_delivery" },
  { id: "s_bars", he: "ברים", cat: "c_bars" },
  { id: "s_fish", he: "דגים", cat: "c_groceries" },
  { id: "s_meat", he: "בשר ועוף", cat: "c_groceries" },
  { id: "s_produce", he: "פירות וירקות", cat: "c_groceries" },
  { id: "s_dairy", he: "מוצרי חלב וביצים", cat: "c_groceries" },
  { id: "s_bakery", he: "מאפים ולחם", cat: "c_groceries" },
  { id: "s_grocery_general", he: "סופר כללי", cat: "c_groceries" },
  { id: "s_cleaning", he: "ניקיון", cat: "c_supplies" },
  { id: "s_rent", he: "שכר דירה", cat: "c_rent" },
  { id: "s_arnona", he: "ארנונה", cat: "c_arnona" },
  { id: "s_electricity", he: "חשמל", cat: "c_utilities" },
  { id: "s_water", he: "מים", cat: "c_utilities" },
  { id: "s_gas", he: "גז", cat: "c_utilities" },
  { id: "s_building", he: "ועד בית", cat: "c_utilities" },
  { id: "s_furniture", he: "ריהוט", cat: "c_furniture" },
  { id: "s_fuel", he: "דלק", cat: "c_fuel" },
  { id: "s_parking", he: "חניה", cat: "c_parking" },
  { id: "s_public", he: "תחבורה ציבורית", cat: "c_public" },
  { id: "s_taxi", he: "מוניות", cat: "c_public" },
  { id: "s_car_repair", he: "תיקוני רכב", cat: "c_car" },
  { id: "s_clothing", he: "ביגוד והנעלה", cat: "c_shopping" },
  { id: "s_shopping_other", he: "קניות כלליות", cat: "c_shopping" },
  { id: "s_cinema", he: "קולנוע והופעות", cat: "c_entertainment" },
  { id: "s_hobbies", he: "תחביבים", cat: "c_entertainment" },
  { id: "s_flights", he: "טיסות", cat: "c_travel" },
  { id: "s_hotels", he: "מלונות", cat: "c_travel" },
  { id: "s_gym", he: "חדר כושר", cat: "c_sport" },
  { id: "s_electronics", he: "אלקטרוניקה", cat: "c_electronics" },
  { id: "s_pharmacy", he: "פארם", cat: "c_pharmacy" },
  { id: "s_insurance", he: "ביטוחים", cat: "c_insurance" },
  { id: "s_cellular", he: "סלולר", cat: "c_cellular" },
  { id: "s_internet", he: "אינטרנט", cat: "c_internet" },
  { id: "s_streaming", he: "סטרימינג ומנויים", cat: "c_subscriptions" },
  { id: "s_salary", he: "משכורת", cat: "c_salary" },
  { id: "s_other_income", he: "הכנסה אחרת", cat: "c_other_income" },
  { id: "s_savings", he: "הפקדה לחיסכון", cat: "c_savings" },
  { id: "s_investment", he: "הפקדה להשקעות", cat: "c_investments" },
  { id: "s_transfer", he: "העברה עצמית", cat: "c_transfer" },
  { id: "s_card_bill", he: "חיוב כרטיס", cat: "c_card_bill" },
  { id: "s_uncategorized", he: "לא מסווג", cat: "c_uncategorized" },
];

const parentById = new Map(PARENTS.map((p) => [p.id, p]));
const catById = new Map(CATS.map((c) => [c.id, c]));
const subById = new Map(SUBS.map((s) => [s.id, s]));

export type Resolved = {
  subcategoryId: string; categoryId: string; parentCategoryId: string;
  subHe: string; categoryHe: string; parentHe: string;
  financialType: FinancialType; consumptionType: ConsumptionType | null; color: string; icon: string;
};

export function resolveSub(subId: string): Resolved {
  const s = subById.get(subId) ?? subById.get("s_uncategorized")!;
  const c = catById.get(s.cat)!;
  const p = parentById.get(c.parent)!;
  return {
    subcategoryId: s.id, categoryId: c.id, parentCategoryId: p.id,
    subHe: s.he, categoryHe: c.he, parentHe: p.he,
    financialType: c.financial ?? "expense", consumptionType: c.consumption, color: p.color, icon: p.icon,
  };
}

export const isKnownSub = (id: string) => subById.has(id);

/** Flat nodes for seeding the categories table. */
export function taxonomyNodes(): CategoryNode[] {
  return [
    ...PARENTS.map((p): CategoryNode => ({ id: p.id, parentId: null, level: "parent", he: p.he, icon: p.icon, color: p.color, financialType: "expense" })),
    ...CATS.map((c): CategoryNode => ({ id: c.id, parentId: c.parent, level: "category", he: c.he, consumptionType: c.consumption, financialType: c.financial ?? "expense", color: parentById.get(c.parent)!.color })),
    ...SUBS.map((s): CategoryNode => {
      const c = catById.get(s.cat)!;
      return { id: s.id, parentId: s.cat, level: "subcategory", he: s.he, consumptionType: c.consumption, financialType: c.financial ?? "expense", color: parentById.get(c.parent)!.color };
    }),
  ];
}
