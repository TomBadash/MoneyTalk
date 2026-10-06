import Link from "next/link";
import type { Txn } from "@/domain/types";
import { nodeInfo, resolveSub } from "@/classify/taxonomy";
import { formatAgorot } from "@/lib/format";

const KIND: Record<string, string> = { income: "הכנסה", transfer: "העברה", savings: "חיסכון", investment: "השקעה" };

export function TxnRow({ t, product, href }: { t: Txn; product?: string; href?: string }) {
  const r = resolveSub(t.subcategoryId ?? "s_uncategorized");
  const title = product && t.sourceProvider === "manual" ? product : t.merchantRaw || t.descriptionRaw;
  const isExpense = t.financialType === "expense";
  const ai = (t.aiConfidence ?? 1) < 0.9 && (t.aiConfidence ?? 1) >= 0.7 && !t.userCorrected;
  const sign = t.financialType === "income" ? "+" : "";
  const body = (
    <>
      <span className="ic" style={{ background: r.color }} aria-hidden>{r.icon}</span>
      <span className="meta">
        <span className="t" dir="auto">{title}{t.installmentTotal ? <small className="muted"> · תשלום {t.installmentNumber}/{t.installmentTotal}</small> : null}</span>
        <span className="s">
          {r.categoryHe} › {r.subHe}
          {ai && <span className="ai-tag" title="סווג אוטומטית">AI</span>}
          {t.needsReview && <span className="rv-tag">לאישור</span>}
          {!isExpense && <span className="kind-tag">{KIND[t.financialType]}</span>}
        </span>
      </span>
      <span className={`amt tnum ${isExpense ? "" : "fixed"} ${t.financialType === "income" ? "pos" : ""}`}>{sign}{formatAgorot(t.amount, t.amount % 100 !== 0)}</span>
    </>
  );
  return href ? <Link href={href} className="exp">{body}</Link> : <div className="exp">{body}</div>;
}

export { nodeInfo };
