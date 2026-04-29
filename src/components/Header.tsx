import { useEffect, useState } from "react";
import { useDashboard } from "../hooks/useDashboard.ts";
import { formatCost, formatTokens, relativeTime, shortModel } from "../lib/utils.ts";
import { cn } from "../lib/utils.ts";

interface HeaderProps {
  connected: boolean;
}

export function Header({ connected }: HeaderProps): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const session = snapshot?.activeSession;
  const totals = snapshot?.totals;

  // 1s ticker so freshness stays accurate
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const lastActivity = session?.lastActivityAt;

  return (
    <header className="flex items-center justify-between gap-8 px-6 h-11 bg-bg-elev/50 backdrop-blur">
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="text-[13px] font-semibold tracking-tight text-fg">claude-watch</span>
        <span className="text-[9px] uppercase tracking-[0.22em] text-fg-dim">supervision</span>
        {session && (
          <span className="ml-2 px-1.5 py-0.5 rounded-xs border border-border text-[9px] uppercase tracking-[0.16em] text-fg-muted bg-bg-card/60 truncate">
            {shortModel(session.model)}
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-0 text-[11px] tabular">
        {session && (
          <Group>
            <Stat label="turns" value={session.turnCount.toString()} />
            <Stat
              label="ctx"
              value={`${(session.contextUsage.pct * 100).toFixed(1)}%`}
              accent={session.contextUsage.pct > 0.85}
            />
          </Group>
        )}
        {totals && (
          <Group>
            <Stat label="today" value={formatTokens(totals.todayTokens)} sub={formatCost(totals.todayCost)} />
            <Stat label="all-time" value={formatTokens(totals.allTimeTokens)} sub={formatCost(totals.allTimeCost)} />
          </Group>
        )}
        <Group>
          {lastActivity ? (
            <Stat label="last" value={relativeTime(lastActivity)} />
          ) : (
            <Stat label="last" value="—" />
          )}
          <NotificationsToggle />
        </Group>
        <Group last>
          <div className="flex items-center gap-2 text-fg-muted">
            <span
              className={cn(
                "size-1.5 rounded-full",
                connected ? "bg-success pulse-soft" : "bg-danger",
              )}
            />
            <span className="uppercase tracking-[0.18em] text-[9px]">
              {connected ? "live" : "reconnect"}
            </span>
          </div>
        </Group>
      </div>
    </header>
  );
}

function Group({ children, last }: { children: React.ReactNode; last?: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-5 px-5 border-l border-border",
        last && "pr-0",
      )}
    >
      {children}
    </div>
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
        "text-[9px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-xs border transition-colors",
        enabled
          ? "border-success/50 text-success bg-success/5"
          : "border-border text-fg-dim hover:text-fg-muted hover:border-border-strong",
      )}
    >
      notify
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col items-end leading-[1.1]">
      <span className="text-[8.5px] uppercase tracking-[0.2em] text-fg-dim">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className={cn("text-[12px] font-medium tracking-tight", accent ? "text-warning" : "text-fg")}>
          {value}
        </span>
        {sub && <span className="text-[10px] text-fg-dim">{sub}</span>}
      </span>
    </div>
  );
}
