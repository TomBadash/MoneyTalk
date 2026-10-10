"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";

type Mark = "X" | "O";
type Cell = Mark | null;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function getWinner(board: Cell[]): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { mark: board[a], line };
    }
  }
  return null;
}

/** Computer move: win if possible, else block, else center, corner, any. */
function cpuMove(board: Cell[], me: Mark): number {
  const other: Mark = me === "X" ? "O" : "X";
  const empty = board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  for (const mark of [me, other]) {
    for (const i of empty) {
      const t = board.slice();
      t[i] = mark;
      if (getWinner(t)) return i;
    }
  }
  const pick = (opts: number[]) => {
    const free = opts.filter((i) => !board[i]);
    return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
  };
  const m = pick([4]);
  if (m >= 0) return m;
  const c = pick([0, 2, 6, 8]);
  return c >= 0 ? c : pick([1, 3, 5, 7]);
}

export default function TicTacToePage() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<Mark>("X");
  const [vsCpu, setVsCpu] = useState(true);
  const [score, setScore] = useState({ X: 0, O: 0, draw: 0 });

  const win = getWinner(board);
  const draw = !win && board.every(Boolean);
  const over = !!win || draw;

  function play(i: number) {
    if (board[i] || over) return;
    const next = board.slice();
    next[i] = turn;
    let w = getWinner(next);
    let mover = turn;
    // Computer answers as O right after the human's X move.
    if (vsCpu && !w && !next.every(Boolean)) {
      next[cpuMove(next, "O")] = "O";
      w = getWinner(next);
      mover = "O";
    }
    setBoard(next);
    if (w) setScore((s) => ({ ...s, [w.mark]: s[w.mark] + 1 }));
    else if (next.every(Boolean)) setScore((s) => ({ ...s, draw: s.draw + 1 }));
    else setTurn(vsCpu ? "X" : mover === "X" ? "O" : "X");
  }

  function setMode(cpu: boolean) {
    setVsCpu(cpu);
    setBoard(Array(9).fill(null));
    setTurn("X");
    setScore({ X: 0, O: 0, draw: 0 });
  }

  function newRound() {
    setBoard(Array(9).fill(null));
    setTurn(!vsCpu && win ? (win.mark === "X" ? "O" : "X") : "X");
  }

  const status = win
    ? `🎉 ${win.mark} ניצח!`
    : draw
      ? "תיקו 🤝"
      : `תור של ${turn}`;

  return (
    <AppShell title="איקס עיגול" subtitle={vsCpu ? "אתה X, המחשב O" : "שני שחקנים על אותו מכשיר"}>
      <div className="spread" style={{ gap: 8, marginBottom: 14 }}>
        <button
          className={vsCpu ? "btn" : "btn ghost"}
          style={{ padding: 12, fontSize: 15 }}
          onClick={() => setMode(true)}
        >
          🤖 נגד המחשב
        </button>
        <button
          className={vsCpu ? "btn ghost" : "btn"}
          style={{ padding: 12, fontSize: 15 }}
          onClick={() => setMode(false)}
        >
          👥 שני שחקנים
        </button>
      </div>

      <div className="card">
        <div className="spread tnum" style={{ fontWeight: 800 }}>
          <span style={{ color: "var(--c-car)" }}>X: {score.X}</span>
          <span className="muted">תיקו: {score.draw}</span>
          <span style={{ color: "var(--c-shop)" }}>O: {score.O}</span>
        </div>
      </div>

      <div
        style={{
          textAlign: "center",
          fontSize: 22,
          fontWeight: 800,
          margin: "18px 0",
        }}
        aria-live="polite"
      >
        {status}
      </div>

      <div
        dir="ltr"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          maxWidth: 340,
          margin: "0 auto 24px",
        }}
      >
        {board.map((cell, i) => {
          const hl = win?.line.includes(i);
          return (
            <button
              key={i}
              onClick={() => play(i)}
              disabled={!!cell || over}
              aria-label={`משבצת ${i + 1}${cell ? `: ${cell}` : ""}`}
              style={{
                aspectRatio: "1",
                borderRadius: "var(--radius-sm)",
                border: `2px solid ${hl ? "var(--accent)" : "var(--line)"}`,
                background: hl ? "var(--accent-soft)" : "var(--surface)",
                boxShadow: "var(--shadow-sm)",
                fontSize: 52,
                fontWeight: 900,
                color: cell === "X" ? "var(--c-car)" : "var(--c-shop)",
                cursor: cell || over ? "default" : "pointer",
              }}
            >
              {cell}
            </button>
          );
        })}
      </div>

      <button className="btn" onClick={newRound}>
        {over ? "סיבוב חדש" : "התחל מחדש"}
      </button>
    </AppShell>
  );
}
