import { useDashboard } from "../hooks/useDashboard.ts";
import { cn } from "../lib/utils.ts";

const SOURCE_LABEL: Record<string, string> = {
  project: "project",
  global: "global",
  plugin: "plugin",
};

const SOURCE_COLOR: Record<string, string> = {
  project: "text-success border-success/30 bg-success/5",
  global: "text-accent border-accent/30 bg-accent/5",
  plugin: "text-fg-dim border-border bg-bg-card/60",
};

export function AgentRoster(): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const selected = useDashboard((s) => s.selectedProjectKey);
  const selectedAgentName = useDashboard((s) => s.selectedAgentName);
  const key = selected ?? snapshot?.activeProjectKey ?? null;
  const agents = (key ? snapshot?.agentsByProject?.[key] : snapshot?.agents) ?? [];
  const flow = snapshot?.flow;

  const runningTypes = new Set(
    flow?.nodes.filter((n) => n.status === "running").map((n) => n.agentType) ?? [],
  );

  if (agents.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-5">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">Subagents</span>
        <p className="text-fg-dim text-xs italic mt-1">
          No subagents discovered for this project.
        </p>
      </div>
    );
  }

  const projectAgents = agents.filter((a) => a.source === "project");
  const others = agents.filter((a) => a.source !== "project");

  return (
    <div className="flex flex-col gap-6 p-5">
      {projectAgents.length > 0 && (
        <Group
          title="Project subagents"
          agents={projectAgents}
          runningTypes={runningTypes}
          activeName={selectedAgentName}
          highlight
        />
      )}
      {others.length > 0 && (
        <Group
          title="Global / plugin"
          agents={others}
          runningTypes={runningTypes}
          activeName={selectedAgentName}
        />
      )}
    </div>
  );
}

function Group({
  title,
  agents,
  runningTypes,
  activeName,
  highlight,
}: {
  title: string;
  agents: import("@shared/types.ts").AgentDefinition[];
  runningTypes: Set<string>;
  activeName: string | null;
  highlight?: boolean;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">{title}</span>
        <span className="text-[10px] text-fg-dim tabular">{agents.length}</span>
      </div>
      <ul className="flex flex-col">
        {agents.map((a, idx) => {
          const live = runningTypes.has(a.name);
          const active = activeName === a.name;
          const sourceLabel = a.pluginName ?? SOURCE_LABEL[a.source];
          return (
            <li
              key={`${a.kind}:${a.source}:${a.name}`}
              onClick={() => useDashboard.getState().openAgentModal(a.name)}
              className={cn(
                "group relative cursor-pointer pl-3.5 pr-3 py-2.5 -mx-px",
                "rounded-md border border-transparent",
                "transition-[background-color,border-color,transform] duration-150",
                "hover:bg-bg-hover/70 hover:border-border",
                idx > 0 && "mt-px",
                highlight && !active && "bg-bg-card/40",
                live && "border-warning/30",
                active && "bg-bg-hover border-border-strong",
              )}
              title={a.description ?? a.name}
            >
              {/* accent left border on hover/active/live */}
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1.5 bottom-1.5 w-px rounded-full transition-colors",
                  live
                    ? "bg-warning"
                    : active
                    ? "bg-accent"
                    : "bg-transparent group-hover:bg-border-strong",
                )}
              />

              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col min-w-0 gap-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {live && (
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-warning pulse-soft shrink-0 translate-y-px"
                      />
                    )}
                    <span className="text-[13px] leading-tight text-fg truncate">
                      {a.name}
                    </span>
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.18em] text-fg-dim">
                    {a.kind}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 self-start mt-0.5 text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-sm border",
                    SOURCE_COLOR[a.source] ?? "text-fg-dim border-border",
                  )}
                >
                  {sourceLabel}
                </span>
              </div>

              {a.description && (
                <p className="mt-1.5 text-[11px] text-fg-dim line-clamp-2 leading-snug">
                  {a.description}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
