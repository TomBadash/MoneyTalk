import type { Agorot } from "@/domain/types";

/** ₪ (possibly fractional) → integer agorot, rounding half away from zero. */
export function toAgorot(shekels: number): Agorot {
  return Math.sign(shekels) * Math.round(Math.abs(shekels) * 100 + 1e-9);
}

export function toShekels(a: Agorot): number {
  return a / 100;
}

/** Split `total` across weights with largest-remainder so the parts sum exactly. */
export function allocate(total: Agorot, weights: number[]): Agorot[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const base = Math.trunc(total / weights.length);
    const out = weights.map(() => base);
    out[0] += total - base * weights.length;
    return out;
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((s, x) => s + x, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) floors[order[k].i]++;
  return floors;
}

export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return (curr - prev) / Math.abs(prev);
}
