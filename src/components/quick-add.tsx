"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickAddAction, undoAction, correctAction, type QuickAddSummary } from "@/app/actions";
import { parseQuick } from "@/classify/quick-parse";
import { subcategoryGroups } from "@/classify/taxonomy";
import { formatAgorot } from "@/lib/format";

const EVENT = "mt:quickadd";
/** Open the Quick Add dialog from anywhere (buttons, shortcuts). */
export const openQuickAdd = (prefill = "") => window.dispatchEvent(new CustomEvent(EVENT, { detail: prefill }));

type Toast =
  | { kind: "saving"; description: string; amount: number }
  | { kind: "done"; s: QuickAddSummary; editing: boolean }
  | { kind: "undone" }
  | { kind: "error"; message: string; text: string };

const groups = subcategoryGroups();

export function QuickAddHost() {
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const open = (prefill = "") => {
    setText(prefill);
    if (!dlg.current?.open) dlg.current?.showModal();
    requestAnimationFrame(() => input.current?.focus()); // one input, focused immediately
  };
  const close = () => dlg.current?.close();

  useEffect(() => {
    const onEvt = (e: Event) => open((e as CustomEvent<string>).detail ?? "");
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); open(); }
      else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "n" || e.key === "N" || e.key === "מ")) { e.preventDefault(); open(); }
    };
    window.addEventListener(EVENT, onEvt);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(EVENT, onEvt); window.removeEventListener("keydown", onKey); };
  }, []);

  const arm = (ms = 7000) => { clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), ms); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = text.trim();
    if (!raw) return;
    const p = parseQuick(raw);
    if (p.amount == null) { setToast({ kind: "error", message: "לא זיהינו סכום. כתוב למשל: קפה 18", text: raw }); return; }
    close();
    setToast({ kind: "saving", description: p.description, amount: p.amount }); // optimistic: shown instantly
    clearTimeout(timer.current);
    start(async () => {
      const r = await quickAddAction(raw);
      if (r.ok) { setToast({ kind: "done", s: r.summary, editing: false }); arm(); router.refresh(); }
      else { setToast({ kind: "error", message: r.error, text: raw }); }
    });
  };

  const undo = (id: string) => start(async () => { await undoAction(id); setToast({ kind: "undone" }); arm(2500); router.refresh(); });
  const correct = (id: string, sub: string) => start(async () => {
    const r = await correctAction(id, sub);
    if (r.ok) { setToast({ kind: "done", s: r.summary, editing: false }); arm(); router.refresh(); }
  });

  const preview = parseQuick(text);

  return (
    <>
      <dialog ref={dlg} className="qa-dialog" aria-label="הוספת הוצאה מהירה" onClick={(e) => { if (e.target === dlg.current) close(); }}>
        <form onSubmit={submit} className="qa-form">
          <div className="quick">
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="מה קנית וכמה?" aria-label="מה קנית וכמה?" autoComplete="off" enterKeyHint="done" maxLength={200} />
            <button className="go" type="submit" aria-label="שמירה" disabled={!text.trim()}>↵</button>
          </div>
          <div className="parse" aria-live="polite">
            {preview.description && preview.amount != null
              ? <><span className="tag">{preview.description}</span><span className="tag">{formatAgorot(preview.amount, preview.amount % 100 !== 0)}</span><span className="muted">Enter לשמירה</span></>
              : <span className="muted">למשל: קפה 18 · סלמון 62 · סופר 214.50 · וולט 84 אתמול</span>}
          </div>
        </form>
      </dialog>

      <div className="toast-zone" role="status" aria-live="polite">
        {toast?.kind === "saving" && <div className="toast"><span className="ok" aria-hidden>…</span><div><b>{toast.description}</b> <span>{formatAgorot(toast.amount, toast.amount % 100 !== 0)}</span><div className="toast-sub">שומר…</div></div></div>}
        {toast?.kind === "done" && (
          <div className="toast col">
            <div className="row">
              <span className="ok" aria-hidden>✓</span>
              <div className="grow">
                <b>{toast.s.description}</b> <span className="tnum">{formatAgorot(toast.s.amount, toast.s.amount % 100 !== 0)}</span>
                <div className="toast-sub">{toast.s.merchant ? `${toast.s.merchant} › ` : ""}{toast.s.path}{toast.s.band === "ai" && <span className="ai-dot" title="סווג אוטומטית"> · AI</span>}{toast.s.band === "review" && " · ממתין לאישור"}</div>
              </div>
              <button type="button" className="tlink" onClick={() => undo(toast.s.id)}>ביטול</button>
              <button type="button" className="tlink" onClick={() => { setToast({ ...toast, editing: !toast.editing }); clearTimeout(timer.current); }}>עריכה</button>
            </div>
            {toast.editing && (
              <select className="select toast-select" autoFocus aria-label="שינוי קטגוריה" defaultValue={toast.s.subcategoryId} onChange={(e) => correct(toast.s.id, e.target.value)}>
                {groups.map((g) => <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o.id} value={o.id}>{o.he}</option>)}</optgroup>)}
              </select>
            )}
          </div>
        )}
        {toast?.kind === "undone" && <div className="toast"><span className="ok" aria-hidden>↶</span>ההוצאה בוטלה</div>}
        {toast?.kind === "error" && (
          <div className="toast err"><div className="grow">{toast.message}</div><button type="button" className="tlink" onClick={() => { setToast(null); open(toast.text); }}>נסה שוב</button></div>
        )}
      </div>
    </>
  );
}
