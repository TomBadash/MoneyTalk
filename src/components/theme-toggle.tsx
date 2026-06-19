"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/** Round light/dark toggle. Renders a stable placeholder until mounted
 *  to avoid hydration mismatch (theme is only known on the client). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="החלפת מצב כהה/בהיר"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-sm)",
        fontSize: 18,
      }}
    >
      {mounted ? (isDark ? "☀️" : "🌙") : "🌙"}
    </button>
  );
}
