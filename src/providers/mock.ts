import { randomBytes } from "node:crypto";
import type { FinancialDataProvider, ProviderTxn } from "./types";
import { generateDemoDrafts } from "@/db/seed/demo";

/** Stand-in "bank" that behaves like a hosted-consent aggregator. Data is the deterministic demo history. */
export class MockProvider implements FinancialDataProvider {
  readonly id = "mock";
  readonly displayName = "בנק לדוגמה (הדגמת Open Banking)";

  async beginConnect({ returnUrl }: { userId: string; returnUrl: string }) {
    const state = randomBytes(16).toString("base64url");
    return { state, redirectUrl: `/accounts/mock-consent?state=${state}&return=${encodeURIComponent(returnUrl)}` };
  }

  async completeConnect({ params }: { state: string; params: Record<string, string> }) {
    if (params.consent !== "granted") throw new Error("consent_denied");
    return {
      handle: { token: `mock_${randomBytes(18).toString("base64url")}`, expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() },
      institution: "בנק לדוגמה",
      accounts: [
        { externalId: "mock-bank-1", kind: "bank" as const, institution: "בנק לדוגמה", name: "עו״ש", balance: 2_134_000 },
        { externalId: "mock-card-1", kind: "credit_card" as const, institution: "בנק לדוגמה", name: "כרטיס אשראי •• 4821", balance: null },
      ],
    };
  }

  async fetchTransactions(_h: unknown, accountExternalId: string, since: string, today: string): Promise<ProviderTxn[]> {
    const wantCard = accountExternalId.includes("card");
    return generateDemoDrafts(today)
      .filter((d) => d.source === "demo" && (d.accountId === "demo-card") === wantCard && d.date >= since)
      .map((d) => ({
        externalId: `mock-${d.externalId}`, accountExternalId, date: d.date, description: d.description, merchant: d.merchant ?? null,
        amount: d.amount, direction: d.direction ?? "debit", installmentNumber: d.installmentNumber, installmentTotal: d.installmentTotal,
      }));
  }

  async revoke() { /* nothing to revoke remotely */ }
}
