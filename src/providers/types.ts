import type { Agorot, IsoDate } from "@/domain/types";

export type ProviderAccount = { externalId: string; kind: "bank" | "credit_card"; institution: string; name: string; balance?: Agorot | null };
export type ProviderTxn = {
  externalId: string; accountExternalId: string; date: IsoDate; postingDate?: IsoDate | null;
  description: string; merchant?: string | null; amount: Agorot; direction: "debit" | "credit";
  installmentNumber?: number | null; installmentTotal?: number | null;
};
/** Opaque, provider-issued, read-only credential. Stored encrypted; never sent to the browser. */
export type ConnectionHandle = { token: string; expiresAt?: string | null };

/**
 * Open-banking aggregator contract. Connections are READ-ONLY and the user authorises at the
 * provider's own consent screen — this app never sees or stores bank passwords.
 * Implement it for a real Israeli aggregator and register it; nothing else changes.
 */
export interface FinancialDataProvider {
  readonly id: string;
  readonly displayName: string;
  /** Start provider-hosted consent. Returns where to send the user and an opaque state to verify on return. */
  beginConnect(opts: { userId: string; returnUrl: string }): Promise<{ redirectUrl: string; state: string }>;
  completeConnect(opts: { state: string; params: Record<string, string> }): Promise<{ handle: ConnectionHandle; institution: string; accounts: ProviderAccount[] }>;
  fetchTransactions(handle: ConnectionHandle, accountExternalId: string, since: IsoDate, today: IsoDate): Promise<ProviderTxn[]>;
  revoke(handle: ConnectionHandle): Promise<void>;
}
