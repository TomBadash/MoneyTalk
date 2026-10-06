import "server-only";
import type { FinancialDataProvider } from "./types";
import { MockProvider } from "./mock";

const providers = new Map<string, FinancialDataProvider>();
// The mock bank produces fake data, so in production it is opt-in (ENABLE_MOCK_PROVIDER=1, e.g. for a public demo).
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_PROVIDER === "1") providers.set("mock", new MockProvider());

/** Register a real aggregator here (e.g. from an env-gated module) — callers only know the interface. */
export function registerProvider(p: FinancialDataProvider) { providers.set(p.id, p); }
export function getProvider(id: string): FinancialDataProvider | undefined { return providers.get(id); }
export function listProviders(): FinancialDataProvider[] { return [...providers.values()]; }
