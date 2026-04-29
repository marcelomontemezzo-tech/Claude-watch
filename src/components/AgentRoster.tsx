import { useDashboard } from "../hooks/useDashboard.ts";
import { cn } from "../lib/utils.ts";

const SOURCE_LABEL: Record<string, string> = {
  project: "project",
  global: "global",
  plugin: "plugin",
};

const SOURCE_COLOR: Record<string, string> = {
  project: "text-success border-success/40",
  global: "text-accent border-accent/40",
  plugin: "text-fg-muted border-border-strong",
};

export function AgentRoster(): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const selected = useDashboard((s) => s.selectedProjectKey);
  const key = selected ?? snapshot?.activeProjectKey ?? null;
  const agents = (key ? snapshot?.agentsByProject?.[key] : snapshot?.agents) ?? [];
  const flow = snapshot?.flow;

  const runningTypes = new Set(
    flow?.nodes.filter((n) => n.status === "running").map((n) => n.agentType) ?? [],
  );

  if (agents.length === 0) {
    return (
      <div className="p-6 text-fg-dim text-xs">No agents or skills detected for this project.</div>
    );
  }

  const projectAgents = agents.filter((a) => a.source === "project");
  const others = agents.filter((a) => a.source !== "project");

  return (
    <div className="flex flex-col gap-5 p-5">
      {projectAgents.length > 0 && (
        <Group title="Project subagents" agents={projectAgents} runningTypes={runningTypes} highlight />
      )}
      {others.length > 0 && (
        <Group title="Global / plugin" agents={others} runningTypes={runningTypes} />
      )}
    </div>
  );
}

function Group({
  title,
  agents,
  runningTypes,
  highlight,
}: {
  title: string;
  agents: import("@shared/types.ts").AgentDefinition[];
  runningTypes: Set<string>;
  highlight?: boolean;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">{title}</span>
        <span className="text-[10px] text-fg-dim">{agents.length}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {agents.map((a) => {
          const live = runningTypes.has(a.name);
          return (
            <li
              key={`${a.kind}:${a.source}:${a.name}`}
              onClick={() => useDashboard.getState().openAgentModal(a.name)}
              className={cn(
                "rounded-md border px-3 py-2 text-xs transition-colors cursor-pointer",
                "border-transparent bg-bg-card/60 hover:bg-bg-hover",
                live && "border-warning/40",
                highlight && "bg-bg-card",
              )}
              title={`${a.description ?? ""} · click to open`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={cn(
                      "text-[8px] uppercase tracking-[0.14em] px-1 py-px rounded-sm shrink-0",
                      a.kind === "skill" ? "bg-info/15 text-info" : "bg-accent/15 text-accent",
                    )}
                  >
                    {a.kind}
                  </span>
                  <span className="font-medium truncate">{a.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {live && <span className="size-1.5 rounded-full bg-warning pulse-soft" />}
                  <span
                    className={cn(
                      "text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-sm border",
                      SOURCE_COLOR[a.source] ?? "text-fg-dim",
                    )}
                  >
                    {a.pluginName ?? SOURCE_LABEL[a.source]}
                  </span>
                </div>
              </div>
              {a.description && (
                <p className="mt-1 text-[10px] text-fg-dim line-clamp-2 leading-snug">
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
