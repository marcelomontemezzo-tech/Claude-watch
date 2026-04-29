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
      <nav className="flex items-center border-b border-border bg-bg-elev/40 px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative px-4 py-2.5 text-xs font-medium transition-colors",
              "border-b-2 -mb-px",
              tab === t.id
                ? "border-accent text-fg"
                : "border-transparent text-fg-dim hover:text-fg-muted",
            )}
            title={`${t.hint} · press ${t.key}`}
          >
            <span className="flex items-center gap-2">
              <span className="text-[8px] text-fg-dim/50 tabular">{t.key}</span>
              {t.label}
              {counts[t.id] != null && counts[t.id]! > 0 && (
                <span
                  className={cn(
                    "text-[9px] tabular px-1.5 py-px rounded-sm",
                    tab === t.id ? "bg-accent/20 text-accent" : "bg-bg-card text-fg-dim",
                  )}
                >
                  {counts[t.id]}
                </span>
              )}
            </span>
            <span className="block text-[9px] uppercase tracking-[0.18em] text-fg-dim/60 mt-0.5 leading-none">
              {t.hint}
            </span>
          </button>
        ))}
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
