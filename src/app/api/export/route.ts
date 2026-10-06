import { NextResponse } from "next/server";
import { getContextOrNull } from "@/lib/context";

/** Download everything we hold about the signed-in user (JSON). Raw imported fields are included untouched. */
export async function GET() {
  const ctx = await getContextOrNull();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = ctx.write;
  const [profile, transactions, products, merchants, rules, budgets, goals, recurring, accounts, connections, notifications] = await Promise.all([
    r.profile(), r.txns(), r.products(), r.merchants(), r.rules(), r.budgets(), r.goals(), r.recurring(), r.accounts(), r.connections(), r.notifications(),
  ]);
  await r.audit("data.export");
  const body = { exportedAt: new Date().toISOString(), profile, accounts, connections: connections.map(({ id, provider, institution, status, lastSuccessfulSync }) => ({ id, provider, institution, status, lastSuccessfulSync })), transactions, products, merchants, categorizationRules: rules, budgets, goals, recurring, notifications };
  return new NextResponse(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="moneytalk-export-${ctx.today}.json"`, "Cache-Control": "no-store" } });
}
