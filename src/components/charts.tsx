import { formatAgorot } from "@/lib/format";

/** Server-rendered bar chart: single series or stacked. Bars are links when `href` is given (drill-down). */
export type BarDatum = { key: string; label: string; parts: { value: number; color: string; name?: string }[]; href?: string };

export function Bars({ data, height = 150, unit = formatAgorot, highlight }: { data: BarDatum[]; height?: number; unit?: (v: number) => string; highlight?: string }) {
  const max = Math.max(1, ...data.map((d) => d.parts.reduce((s, p) => s + p.value, 0)));
  return (
    <div className="bars2" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${unit(d.parts.reduce((s, p) => s + p.value, 0))}`).join(", ")}>
      {data.map((d) => {
        const total = d.parts.reduce((s, p) => s + p.value, 0);
        const inner = (
          <>
            <span className="bv tnum">{total > 0 ? unit(total) : ""}</span>
            <span className="track"><span className="stack" style={{ height: `${(total / max) * 100}%` }}>
              {d.parts.filter((p) => p.value > 0).map((p, i) => <i key={i} style={{ flex: p.value, background: p.color }} title={`${p.name ?? ""} ${unit(p.value)}`} />)}
            </span></span>
            <span className={`bl ${highlight === d.key ? "sel" : ""}`}>{d.label}</span>
          </>
        );
        return d.href ? <a key={d.key} href={d.href} className="bar2">{inner}</a> : <div key={d.key} className="bar2">{inner}</div>;
      })}
    </div>
  );
}

/** Minimal line for price history etc. */
export function Spark({ values, height = 56, label }: { values: number[]; height?: number; label: string }) {
  if (values.length < 2) return null;
  const W = 300, min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${height - 6 - ((v - min) / span) * (height - 12)}`);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="spark2" role="img" aria-label={label} preserveAspectRatio="none" style={{ direction: "ltr" }}>
      <polyline points={pts.join(" ")} fill="none" className="sp-line" />
      <circle cx={pts.at(-1)!.split(",")[0]} cy={pts.at(-1)!.split(",")[1]} r="4" className="sp-dot" />
    </svg>
  );
}

/** Horizontal share bars (drill-down rows). */
export function HBars({ rows }: { rows: { key: string; label: string; value: number; color?: string; href?: string; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => {
        const body = (
          <>
            <div className="spread"><span dir="auto">{r.label}</span><b className="tnum">{formatAgorot(r.value)}</b></div>
            <div className="progress thin"><span style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
            {r.sub && <div className="tiny muted">{r.sub}</div>}
          </>
        );
        return r.href ? <a key={r.key} href={r.href} className="hrow">{body}</a> : <div key={r.key} className="hrow">{body}</div>;
      })}
    </div>
  );
}
