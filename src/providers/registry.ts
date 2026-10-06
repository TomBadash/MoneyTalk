import "server-only";
import type { FinancialDataProvider } from "./types";
import { MockProvider } from "./mock";

const providers = new Map<string, FinancialDataProvider>([["mock", new MockProvider()]]);

/** Register a real aggregator here (e.g. from an env-gated module) — callers only know the interface. */
export function registerProvider(p: FinancialDataProvider) { providers.set(p.id, p); }
export function getProvider(id: string): FinancialDataProvider | undefined { return providers.get(id); }
export function listProviders(): FinancialDataProvider[] { return [...providers.values()]; }
