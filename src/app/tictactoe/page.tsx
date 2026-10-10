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

export default function TicTacToePage() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<Mark>("X");
  const [score, setScore] = useState({ X: 0, O: 0, draw: 0 });

  const win = getWinner(board);
  const draw = !win && board.every(Boolean);
  const over = !!win || draw;

  function play(i: number) {
    if (board[i] || over) return;
    const next = board.slice();
    next[i] = turn;
    setBoard(next);
    const w = getWinner(next);
    if (w) setScore((s) => ({ ...s, [w.mark]: s[w.mark] + 1 }));
    else if (next.every(Boolean)) setScore((s) => ({ ...s, draw: s.draw + 1 }));
    else setTurn(turn === "X" ? "O" : "X");
  }

  function newRound() {
    setBoard(Array(9).fill(null));
    setTurn(win ? (win.mark === "X" ? "O" : "X") : "X");
  }

  const status = win
    ? `🎉 ${win.mark} ניצח!`
    : draw
      ? "תיקו 🤝"
      : `תור של ${turn}`;

  return (
    <AppShell title="איקס עיגול" subtitle="שני שחקנים על אותו מכשיר">
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
