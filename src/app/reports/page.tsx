"use client";

import { AppShell } from "@/components/app-shell";

export default function ReportsPage() {
  return (
    <AppShell title="דוחות">
      <div className="empty">
        <div className="em">📊</div>
        <div className="t">דוחות בקרוב</div>
        <div className="s">
          דוח שבועי וחודשי עם השוואות, גרפים ותובנות — בפיתוח.
        </div>
      </div>
    </AppShell>
  );
}
