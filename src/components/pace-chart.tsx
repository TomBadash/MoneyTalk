import type { DashboardPayload } from "@/services/dashboard";
import { formatAgorot } from "@/lib/format";

/** Actual vs ideal cumulative variable spend. Server-rendered SVG (no client JS). */
export function PaceChart({ pace, monthTarget }: { pace: DashboardPayload["pace"]; monthTarget: number }) {
  const W = 600, H = 200, PX = 8, PT = 12, PB = 24;
  const pts = pace.points;
  const n = pts.length;
  const maxY = Math.max(monthTarget, ...pts.map((p) => p.actual ?? 0), 1) * 1.08;
  const x = (i: number) => PX + (i * (W - 2 * PX)) / Math.max(1, n - 1);
  const y = (v: number) => PT + (1 - v / maxY) * (H - PT - PB);
  const ideal = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.ideal).toFixed(1)}`).join(" ");
  const todayIdx = pts.reduce((acc, p, i) => (p.actual != null ? i : acc), 0);
  const actualPts = pts.slice(0, todayIdx + 1);
  const actual = actualPts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.actual ?? 0).toFixed(1)}`).join(" ");
  const area = `${actual} L${x(todayIdx).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
  const tone = pace.status === "over" ? "over" : "ok";
  const label = pace.status === "over" ? "מעל הקצב" : pace.status === "under" ? "מתחת לקצב" : "בקצב";
  const ticks = [0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1];
  const todayPt = pts[todayIdx];
  return (
    <svg className={`pace ${tone}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="pace-t pace-d" preserveAspectRatio="none" style={{ direction: "ltr" }}>
      <title id="pace-t">קצב הוצאות מול יעד</title>
      <desc id="pace-d">{`עד היום הוצאת ${formatAgorot(pace.spentToDate)} לעומת קצב אידיאלי של ${formatAgorot(pace.idealToDate)} — ${label}.`}</desc>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={PX} x2={W - PX} y1={y(monthTarget * f)} y2={y(monthTarget * f)} className="grid" />)}
      <path d={ideal} className="ideal" fill="none" />
      <path d={area} className="area" />
      <path d={actual} className="actual" fill="none" />
      <circle cx={x(todayIdx)} cy={y(todayPt.actual ?? 0)} r="5" className="dot" />
      {ticks.map((i) => <text key={i} x={x(i)} y={H - 6} className="tick" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{Number(pts[i].date.slice(8, 10))}</text>)}
    </svg>
  );
}
