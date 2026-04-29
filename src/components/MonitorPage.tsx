import { useMemo } from "react";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatCost, formatTokens, relativeTime } from "../lib/utils.ts";
import { Choreography } from "./Choreography.tsx";
import { TokenMeter } from "./TokenMeter.tsx";
import { EventTimeline } from "./EventTimeline.tsx";
import { AgentRoster } from "./AgentRoster.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

export function MonitorPage(): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const connected = useDashboard((s) => s.connected);
  const drawer = useDashboard((s) => s.monitorDrawer);
  const setDrawer = useDashboard((s) => s.setMonitorDrawer);

  if (!snapshot) {
    return (
      <div className="grid h-full place-items-center text-fg-dim text-xs italic">
        {connected ? "Streaming first snapshot…" : "Reconnecting to supervisor…"}
      </div>
    );
  }

  if (snapshot.projects.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="flex flex-col items-center gap-3 max-w-md">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">no sessions</span>
          <p className="text-fg-muted text-sm">claude-watch is online and idle.</p>
          <p className="text-fg-dim text-xs italic">
            Start a Claude Code session to populate this dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[240px_1fr]">
      <aside className="border-r border-border bg-bg-elev/30 overflow-y-auto">
        <ErrorBoundary>
          <CompactSidebar />
        </ErrorBoundary>
      </aside>
      <main className="relative overflow-hidden">
        <ErrorBoundary>
          <div className="absolute inset-0">
            <Choreography />
          </div>
        </ErrorBoundary>
        <DrawerBar drawer={drawer} setDrawer={setDrawer} />
        {drawer && <DrawerPanel drawer={drawer} />}
      </main>
    </div>
  );
}

function CompactSidebar(): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot)!;
  const selected = useDashboard((s) => s.selectedProjectKey);
  const select = useDashboard((s) => s.selectProject);

  const projects = useMemo(() => snapshot.projects, [snapshot]);

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-fg-dim px-1">
        <span>projects</span>
        <span>{projects.length}</span>
      </div>
      <ul className="flex flex-col gap-px">
        {projects.map((p) => {
          const active = (selected ?? snapshot.activeProjectKey) === p.projectKey;
          return (
            <li key={p.projectKey}>
              <button
                onClick={() => select(p.projectKey)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-sm border border-transparent",
                  "transition-colors",
                  active ? "bg-bg-card border-border-strong" : "hover:bg-bg-hover",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 rounded-full shrink-0",
                      p.isLive ? "bg-success pulse-soft" : "bg-fg-dim/40",
                    )}
                  />
                  <span className="truncate text-xs font-medium">{p.displayName}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-fg-dim tabular pl-3.5">
                  <span>{formatTokens(p.totalTokens)} · {formatCost(p.totalCost)}</span>
                  <span>{p.lastActivityAt ? relativeTime(p.lastActivityAt) : "—"}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Drawer = "tokens" | "timeline" | "agents" | null;

function DrawerBar({
  drawer,
  setDrawer,
}: {
  drawer: Drawer;
  setDrawer: (d: Drawer) => void;
}): JSX.Element {
  const items: { key: Exclude<Drawer, null>; label: string }[] = [
    { key: "tokens", label: "tokens" },
    { key: "timeline", label: "timeline" },
    { key: "agents", label: "agents" },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-1 px-3 h-9 bg-bg/80 backdrop-blur border-t border-border">
      {items.map((it) => {
        const active = drawer === it.key;
        return (
          <button
            key={it.key}
            onClick={() => setDrawer(active ? null : it.key)}
            className={cn(
              "px-2.5 h-7 text-[10px] uppercase tracking-[0.18em] rounded-sm border transition-colors",
              active
                ? "border-accent/60 text-accent bg-accent/10"
                : "border-border text-fg-dim hover:text-fg",
            )}
          >
            {it.label}
          </button>
        );
      })}
      <span className="ml-auto text-[9px] uppercase tracking-[0.16em] text-fg-dim italic">
        choreography is live
      </span>
    </div>
  );
}

function DrawerPanel({ drawer }: { drawer: Exclude<Drawer, null> }): JSX.Element {
  return (
    <div className="absolute bottom-9 left-0 right-0 z-10 max-h-[55%] overflow-hidden border-t border-border bg-bg-elev/95 backdrop-blur shadow-2xl shadow-black/60">
      <ErrorBoundary>
        <div className="h-full overflow-auto">
          {drawer === "tokens" && (
            <div className="grid grid-cols-3 gap-px bg-border">
              <TokenMeter />
            </div>
          )}
          {drawer === "timeline" && <EventTimeline />}
          {drawer === "agents" && (
            <div className="h-[40vh]">
              <AgentRoster />
            </div>
          )}
        </div>
      </ErrorBoundary>
    </div>
  );
}
