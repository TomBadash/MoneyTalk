import { getContext } from "@/lib/context";
import { ReviewQueue, type ReviewItem } from "@/components/review-queue";
import { resolveSub } from "@/classify/taxonomy";
import { formatIso } from "@/lib/format";

export const metadata = { title: "אישור סיווגים — MoneyTalk" };

export default async function Review() {
  const ctx = await getContext();
  const [rows, products] = await Promise.all([ctx.read.txns({ needsReview: true, limit: 100 }), ctx.read.products()]);
  const pname = new Map(products.map((p) => [p.id, p.name]));
  const items: ReviewItem[] = rows.map((t) => {
    const r = resolveSub(t.subcategoryId ?? "s_uncategorized");
    return { id: t.id, title: (t.productId && pname.get(t.productId)) || t.merchantRaw || t.descriptionRaw, amount: t.amount, date: formatIso(t.date), path: `${r.categoryHe} › ${r.subHe}`, confidence: t.aiConfidence ?? 0, reason: t.aiReasoningSummary ?? "", subcategoryId: r.subcategoryId, icon: r.icon, color: r.color };
  });
  return (
    <div>
      <h1 className="ttl">אישור סיווגים</h1>
      <p className="muted" style={{ margin: "6px 0 16px" }}>רק מה שלא היינו בטוחים בו. אישור אחד — ולא נשאל שוב.</p>
      <ReviewQueue items={items} readOnly={ctx.demo && !ctx.local} />
    </div>
  );
}
