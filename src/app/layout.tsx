import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "MoneyTalk — ניהול כספים חכם", template: "%s" },
  description:
    "מערכת הפעלה פיננסית אישית בעברית: כמה נשאר לך להוציא, האם אתה בקצב, וכמה תחסוך — אוטומטית.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F6F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0F1A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
