// Plain (non-client) module so server components can read it too.
export const NAV = [
  { href: "/", label: "דשבורד", icon: "⌂" },
  { href: "/transactions", label: "תנועות", icon: "🧾" },
  { href: "/analytics", label: "ניתוח", icon: "📊" },
  { href: "/budgets", label: "תקציבים", icon: "🎯" },
  { href: "/products", label: "מוצרים", icon: "🛒" },
  { href: "/recurring", label: "קבועות", icon: "🔁" },
  { href: "/accounts", label: "חשבונות", icon: "🏦" },
  { href: "/assistant", label: "עוזר AI", icon: "✨" },
  { href: "/investments", label: "השקעות", icon: "📈", soon: true },
  { href: "/settings", label: "הגדרות", icon: "⚙︎" },
] as const;
