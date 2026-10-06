import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decryptSecret, encryptSecret, newApiKey, safeEqual, sha256 } from "../crypto";

describe("crypto", () => {
  it("round-trips and never stores plaintext", () => {
    const t = encryptSecret("provider-token-123");
    expect(t).not.toContain("provider-token");
    expect(t.startsWith("v1.")).toBe(true);
    expect(decryptSecret(t)).toBe("provider-token-123");
    expect(encryptSecret("x")).not.toBe(encryptSecret("x")); // fresh IV each time
  });
  it("rejects tampering", () => {
    const t = encryptSecret("secret").split(".");
    t[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(t.join("."))).toThrow();
  });
  it("api keys are hashed, prefixed and compare safely", () => {
    const k = newApiKey();
    expect(k.key.startsWith("mt_")).toBe(true);
    expect(k.hash).toBe(sha256(k.key));
    expect(k.hash).not.toContain(k.key);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

import { csvToTransactions, parseDate } from "@/providers/csv";
describe("csv import", () => {
  it("parses Hebrew debit/credit exports (semicolon, DD/MM/YYYY, quoted commas)", () => {
    const csv = 'תאריך;תיאור;חובה;זכות;יתרה\n05/09/2026;"שופרסל דיל, ת""א";214.50;;1000\n09/09/2026;משכורת;;21,500.00;22000\n05/09/2026;"שופרסל דיל, ת""א";214.50;;900\nbad;row;1;;\n';
    const r = csvToTransactions(csv, "acc");
    expect(r.txns).toHaveLength(3);
    expect(r.skipped).toBe(1);
    expect(r.txns[0]).toMatchObject({ date: "2026-09-05", amount: 21450, direction: "debit", description: 'שופרסל דיל, ת"א' });
    expect(r.txns[1]).toMatchObject({ amount: 2150000, direction: "credit" });
    expect(r.txns[0].externalId).not.toBe(r.txns[2].externalId); // identical purchases remain distinct…
    expect(csvToTransactions(csv, "acc").txns[0].externalId).toBe(r.txns[0].externalId); // …and stable across re-imports
  });
  it("signed single amount column + english headers", () => {
    const r = csvToTransactions("Date,Description,Amount\n2026-09-01,Wolt,-84.00\n2026-09-02,Refund,20", "a");
    expect(r.txns.map((t) => [t.direction, t.amount])).toEqual([["debit", 8400], ["credit", 2000]]);
  });
  it("friendly errors", () => {
    expect(csvToTransactions("a,b\n1,2", "a").error).toContain("עמודות");
    expect(parseDate("31.12.26")).toBe("2026-12-31");
    expect(parseDate("nope")).toBeNull();
  });
});
