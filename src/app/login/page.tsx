"use client";

import { useState } from "react";
import { useActionState } from "react";
import { authenticate, type AuthState } from "@/app/auth/actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    authenticate,
    undefined
  );

  const isSignup = mode === "signup";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 20,
      }}
    >
      <span className="logo" style={{ fontSize: 26 }}>
        <span className="mark">₪</span>
        <span className="word">
          Money<b>Talk</b>
        </span>
      </span>

      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <h2 style={{ marginBottom: 4 }}>
          {isSignup ? "יצירת חשבון" : "התחברות"}
        </h2>
        <p className="muted tiny" style={{ marginBottom: 16 }}>
          {isSignup
            ? "פתח/י חשבון חדש כדי לשמור את הנתונים בענן."
            : "התחבר/י כדי לגשת לנתונים שלך מכל מכשיר."}
        </p>

        <form action={formAction}>
          <input type="hidden" name="intent" value={mode} />

          <div className="field" style={{ marginTop: 0 }}>
            <label>אימייל</label>
            <input
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              dir="ltr"
              placeholder="name@example.com"
              required
            />
          </div>

          <div className="field">
            <label>סיסמה</label>
            <input
              className="input"
              type="password"
              name="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              dir="ltr"
              placeholder="••••••••"
              required
            />
          </div>

          {state?.error && (
            <p className="tiny" style={{ color: "var(--negative)", marginTop: 8 }}>
              {state.error}
            </p>
          )}
          {state?.message && (
            <p className="tiny" style={{ color: "var(--accent)", marginTop: 8 }}>
              {state.message}
            </p>
          )}

          <div style={{ height: 18 }} />
          <button className="btn" type="submit" disabled={pending}>
            {pending
              ? "רגע…"
              : isSignup
                ? "יצירת חשבון"
                : "התחברות"}
          </button>
        </form>
      </div>

      <button
        className="btn ghost"
        style={{ width: "auto", padding: "10px 18px" }}
        onClick={() => setMode(isSignup ? "signin" : "signup")}
      >
        {isSignup ? "כבר יש לך חשבון? התחבר/י" : "אין לך חשבון? הרשמה"}
      </button>
    </div>
  );
}
