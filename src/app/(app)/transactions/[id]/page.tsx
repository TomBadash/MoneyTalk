import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { resolveSub } from "@/classify/taxonomy";
import { formatAgorot, formatIso } from "@/lib/format";
import { CategoryPicker, DeleteButton, ApproveButton } from "@/components/txn-actions";

export const metadata = { title: "פרטי תנועה — MoneyTalk" };
const FIN: Record<string, string> = { expense: "הוצאה", income: "הכנסה", transfer: "העברה (לא נספרת כהוצאה)", savings: "חיסכון (לא נספר כהוצאה)", investment: "הפקדה להשקעות (לא נספרת כהוצאה)" };
const CONS: Record<string, string> = { fixed: "קבועה", variable_essential: "משתנה — חיונית", lifestyle: "סגנון חיים", one_off: "חד-פעמית" };

export default async function TransactionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const t = await ctx.read.txn(id);
  if (!t) notFound();
  const [products, merchants] = await Promise.all([ctx.read.products(), ctx.read.merchants()]);
  const product = products.find((p) => p.id === t.productId);
  const merchant = merchants.find((m) => m.id === t.merchantId);
  const r = resolveSub(t.subcategoryId ?? "s_uncategorized");
  const readOnly = ctx.demo && !ctx.local ? true : false;
  const conf = Math.round((t.aiConfidence ?? 0) * 100);

  return (
    <div className="detail">
      <Link href="/transactions" className="muted tiny">‹ חזרה לתנועות</Link>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="row"><span className="ic big" style={{ background: r.color }} aria-hidden>{r.icon}</span>
          <div className="grow"><h1 className="ttl" dir="auto">{product?.name && t.sourceProvider === "manual" ? product.name : t.merchantRaw || t.descriptionRaw}</h1>
            <div className="muted">{formatIso(t.date)}{t.paymentMethod ? ` · ${t.paymentMethod}` : ""}</div></div>
          <div className="big-amt tnum">{formatAgorot(t.amount, t.amount % 100 !== 0)}</div></div>
        <dl className="kv">
          <dt>קטגוריה</dt><dd>{r.parentHe} › {r.categoryHe} › {r.subHe}</dd>
          <dt>סוג</dt><dd>{FIN[t.financialType]}{t.consumptionType ? ` · ${CONS[t.consumptionType]}` : ""}</dd>
          {product && <><dt>מוצר</dt><dd><Link className="lnk" href={`/products/${product.id}`}>{product.name}</Link></dd></>}
          {merchant && <><dt>בית עסק</dt><dd><Link className="lnk" href={`/merchants/${encodeURIComponent(merchant.normalized)}`}>{merchant.name}</Link></dd></>}
          {t.installmentTotal ? <><dt>תשלומים</dt><dd>תשלום {t.installmentNumber} מתוך {t.installmentTotal} · סך העסקה {formatAgorot(t.amount * t.installmentTotal)}</dd></> : null}
          {t.recurringStatus !== "none" && <><dt>חיוב חוזר</dt><dd>כן</dd></>}
        </dl>
      </div>

      <details className="card why" open={t.needsReview}>
        <summary><b>למה סווג כך?</b> <span className="muted tiny">{t.userCorrected ? "אושר על ידך" : `ביטחון ${conf}%`}</span></summary>
        <p>{t.aiReasoningSummary || "הסיווג נקבע על פי כללים ידועים."}</p>
        {t.needsReview && !readOnly && <ApproveButton id={t.id} />}
      </details>

      {!readOnly ? <div className="card"><CategoryPicker id={t.id} current={t.subcategoryId ?? "s_uncategorized"} /></div>
        : <p className="muted tiny">אלו נתוני דוגמה — עריכה זמינה לאחר הוספת נתונים אמיתיים.</p>}

      <details className="card">
        <summary className="muted">נתונים מקוריים (לא משתנים)</summary>
        <dl className="kv">
          <dt>ספק</dt><dd>{t.sourceProvider}</dd><dt>בית עסק (גולמי)</dt><dd dir="auto">{t.merchantRaw}</dd>
          <dt>תיאור (גולמי)</dt><dd dir="auto">{t.descriptionRaw}</dd>{t.externalId && <><dt>מזהה חיצוני</dt><dd dir="ltr">{t.externalId}</dd></>}
        </dl>
      </details>
      {!readOnly && <div style={{ marginTop: 12 }}><DeleteButton id={t.id} /></div>}
    </div>
  );
}
