"use client";

import { useActionState } from "react";
import { createApiKeyAction, type KeyState } from "@/app/account-actions";

export function ApiKeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createApiKeyAction, undefined);
  return (
    <form action={action} className="stack-col">
      <div className="inline-form">
        <div className="field"><label htmlFor="k-n" className="muted tiny">שם המפתח</label><input id="k-n" name="name" className="input" placeholder="קיצור דרך באייפון" maxLength={40} /></div>
        <button className="btn ghost" disabled={pending}>יצירת מפתח</button>
      </div>
      {state?.error && <div role="alert" className="notice bad">{state.error}</div>}
      {state?.key && (
        <div role="status" className="notice ok">
          <b>המפתח שלך (יוצג פעם אחת בלבד — העתק עכשיו):</b>
          <code dir="ltr" className="keybox">{state.key}</code>
          <code dir="ltr" className="keybox small">curl -X POST {typeof window !== "undefined" ? window.location.origin : ""}/api/v1/expense -H &quot;Authorization: Bearer {state.key}&quot; -H &quot;Content-Type: application/json&quot; -d &apos;&#123;&quot;description&quot;:&quot;סלמון&quot;,&quot;amount&quot;:59&#125;&apos;</code>
        </div>
      )}
    </form>
  );
}
