import { AgentFlow } from "./AgentFlow.tsx";
import { Choreography } from "./Choreography.tsx";
import { MemoryBank } from "./MemoryBank.tsx";
import { Scrubber } from "./Scrubber.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { cn } from "../lib/utils.ts";
import { useDashboard } from "../hooks/useDashboard.ts";

type Tab = "live" | "choreography" | "memory";

const TABS: { id: Tab; label: string; hint: string; key: string }[] = [
  { id: "choreography", label: "Choreography", hint: "static workflow", key: "1" },
  { id: "live", label: "Live execution", hint: "runtime spawns", key: "2" },
  { id: "memory", label: "Memory bank", hint: "auto + Obsidian", key: "3" },
];

export function CenterPanel(): JSX.Element {
  const tab = useDashboard((s) => s.centerTab);
  const setTab = useDashboard((s) => s.setCenterTab);
  const snapshot = useDashboard((s) => s.snapshot);
  const selected = useDashboard((s) => s.selectedProjectKey);
  const key = selected ?? snapshot?.activeProjectKey ?? null;
  const choreo = key ? snapshot?.choreographyByProject?.[key] : undefined;
  const memory = key ? snapshot?.memoryByProject?.[key] : undefined;
  const flowRunning =
    snapshot?.flow?.nodes.filter((n) => n.status === "running" && n.parentToolUseId).length ?? 0;

  const counts: Record<Tab, number | null> = {
    live: flowRunning,
    choreography: choreo?.nodes.length ?? 0,
    memory: memory?.totalEntries ?? 0,
  };

  return (
    <div className="flex h-full flex-col">
      <nav
        role="tablist"
        className="flex items-center border-b border-border bg-bg-elev/40 px-5 gap-7"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "group relative flex items-center gap-2 py-3 text-[12px] tracking-tight transition-colors",
                active ? "text-fg" : "text-fg-dim hover:text-fg-muted",
              )}
              title={`${t.hint} · press ${t.key}`}
            >
              <span className="text-[9px] tabular text-fg-dim/60">{t.key}</span>
              <span className="font-medium">{t.label}</span>
              {counts[t.id] != null && counts[t.id]! > 0 && (
                <span
                  className={cn(
                    "text-[10px] tabular tracking-tight transition-colors",
                    active ? "text-fg-muted" : "text-fg-dim/70",
                  )}
                >
                  {counts[t.id]}
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute left-0 right-0 -bottom-px h-px transition-colors",
                  active ? "bg-fg" : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </nav>
      {tab !== "memory" && <Scrubber />}
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary>
          {tab === "live" && <AgentFlow />}
          {tab === "choreography" && <Choreography />}
          {tab === "memory" && <MemoryBank />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
