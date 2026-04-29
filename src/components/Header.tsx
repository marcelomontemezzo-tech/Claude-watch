import { useDashboard } from "../hooks/useDashboard.ts";
import { formatCost, formatTokens, shortModel } from "../lib/utils.ts";
import { cn } from "../lib/utils.ts";

interface HeaderProps {
  connected: boolean;
}

export function Header({ connected }: HeaderProps): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const session = snapshot?.activeSession;
  const totals = snapshot?.totals;

  return (
    <header className="flex items-center justify-between gap-6 px-6 py-3 bg-bg-elev/60 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-accent to-info text-bg font-bold">
          C
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">claude-watch</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-fg-dim">supervision</span>
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs tabular">
        {session && (
          <>
            <Stat label="model" value={shortModel(session.model)} />
            <Stat label="turns" value={session.turnCount.toString()} />
            <Stat label="ctx" value={`${(session.contextUsage.pct * 100).toFixed(1)}%`} accent={session.contextUsage.pct > 0.85} />
          </>
        )}
        {totals && (
          <>
            <Stat label="today" value={`${formatTokens(totals.todayTokens)} · ${formatCost(totals.todayCost)}`} />
            <Stat label="all-time" value={`${formatTokens(totals.allTimeTokens)} · ${formatCost(totals.allTimeCost)}`} />
          </>
        )}
        <NotificationsToggle />
        <div className="flex items-center gap-2 pl-4 border-l border-border text-fg-muted">
          <span
            className={cn(
              "size-1.5 rounded-full",
              connected ? "bg-success pulse-soft" : "bg-danger",
            )}
          />
          <span className="uppercase tracking-[0.16em] text-[10px]">
            {connected ? "live" : "reconnect"}
          </span>
        </div>
      </div>
    </header>
  );
}

function NotificationsToggle(): JSX.Element {
  const enabled = useDashboard((s) => s.notificationsEnabled);
  const set = useDashboard((s) => s.setNotifications);
  const supported = typeof Notification !== "undefined";

  return (
    <button
      onClick={() => {
        if (!supported) return;
        if (!enabled && Notification.permission === "default") {
          void Notification.requestPermission().then((p) => set(p === "granted"));
          return;
        }
        set(!enabled);
      }}
      title={supported ? "Browser notifications for usage thresholds and errors" : "Notifications not supported"}
      className={cn(
        "text-[9px] uppercase tracking-[0.18em] px-2 py-1 rounded-sm border transition-colors",
        enabled
          ? "border-success/60 bg-success/10 text-success"
          : "border-border bg-bg-card text-fg-dim hover:bg-bg-hover",
      )}
    >
      {enabled ? "● notify" : "○ notify"}
    </button>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }): JSX.Element {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[9px] uppercase tracking-[0.18em] text-fg-dim">{label}</span>
      <span className={cn("text-sm font-medium", accent ? "text-warning" : "text-fg")}>{value}</span>
    </div>
  );
}
