"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctAction, undoAction, approveAction } from "@/app/actions";
import { subcategoryGroups } from "@/classify/taxonomy";

const groups = subcategoryGroups();

export function CategoryPicker({ id, current, disabled }: { id: string; current: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <label htmlFor="cat-pick" className="muted tiny">שינוי קטגוריה</label>
      <select id="cat-pick" className="select" defaultValue={current} disabled={disabled || pending}
        onChange={(e) => start(async () => { const r = await correctAction(id, e.target.value); if (r.ok) { setSaved(true); router.refresh(); } })}>
        {groups.map((g) => <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o.id} value={o.id}>{o.he}</option>)}</optgroup>)}
      </select>
      <p className="muted tiny" aria-live="polite">{saved ? "נשמר. נזכור את זה גם להבא ✓" : "נזכור את הבחירה ונשתמש בה בעסקאות דומות."}</p>
    </div>
  );
}

export function DeleteButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn ghost danger" disabled={disabled || pending}
      onClick={() => { if (confirm("למחוק את התנועה?")) start(async () => { await undoAction(id); router.push("/transactions"); router.refresh(); }); }}>
      מחיקת תנועה
    </button>
  );
}

export function ApproveButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { await approveAction(id); router.refresh(); })}>✓ אישור הסיווג</button>;
}
