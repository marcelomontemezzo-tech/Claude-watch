import { useEffect, useRef, useState } from "react";
import type { AgentRun, AgentStatus, TimelineEvent } from "@shared/types.ts";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatDuration } from "../lib/utils.ts";

const STATUS_DOT: Record<AgentStatus, string> = {
  idle: "bg-fg-dim/40",
  running: "bg-warning pulse-soft",
  done: "bg-success",
  error: "bg-danger",
};

export function LiveSubagentTerminals(): JSX.Element | null {
  const flow = useDashboard((s) => s.snapshot?.flow);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!flow) return null;
  const subs = flow.nodes.filter(
    (n) => n.parentToolUseId !== null && (n.recentEvents?.length ?? 0) > 0,
  );
  if (subs.length === 0) return null;

  // Sort: running first, then by most recent
  subs.sort((a, b) => {
    const r = (b.status === "running" ? 1 : 0) - (a.status === "running" ? 1 : 0);
    if (r !== 0) return r;
    return (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt);
  });

  const top = subs.slice(0, 12);

  return (
    <div className="border-t border-border bg-bg-elev/30">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          <span className="size-1.5 rounded-full bg-warning pulse-soft" />
          <span>live subagents</span>
          <span className="text-fg-muted tabular">{subs.length}</span>
        </div>
        {subs.length > top.length && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-fg-dim italic">
            showing {top.length} most recent
          </span>
        )}
      </div>
      <div className="px-3 pb-3 grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {top.map((run) => (
          <SubagentTerminal key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}

function SubagentTerminal({ run }: { run: AgentRun }): JSX.Element {
  const status = run.status;
  const events = run.recentEvents ?? [];
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <div
      className={cn(
        "rounded-md border bg-bg shadow-md shadow-black/40 overflow-hidden flex flex-col",
        status === "running" && "border-warning/50 ring-1 ring-warning/20",
        status === "done" && "border-success/40",
        status === "error" && "border-danger/50 ring-1 ring-danger/20",
        status === "idle" && "border-border",
      )}
    >
      <header className="flex items-center gap-2 px-3 h-7 border-b border-border bg-bg-elev/60">
        <span className={cn("size-1.5 rounded-full shrink-0", STATUS_DOT[status])} />
        <span className="text-[11px] font-medium truncate">{run.agentType}</span>
        <span className="ml-auto text-[9px] uppercase tracking-[0.16em] text-fg-dim tabular">
          {status === "running"
            ? formatDuration(Date.now() - run.startedAt)
            : run.durationMs != null
            ? formatDuration(run.durationMs)
            : "—"}
        </span>
      </header>
      <div
        ref={scrollRef}
        className="flex-1 max-h-44 overflow-y-auto px-2.5 py-2 font-mono text-[10.5px] leading-[1.5] tabular space-y-0.5 bg-bg"
        style={{
          fontFamily:
            "var(--font-mono, ui-monospace, Menlo, Consolas, monospace)",
        }}
      >
        {events.length === 0 ? (
          <div className="text-fg-dim italic">no events yet</div>
        ) : (
          events.map((ev) => <TerminalLine key={ev.id} event={ev} />)
        )}
      </div>
      {run.description && run.description !== run.agentType && (
        <div className="px-3 py-1.5 text-[10px] text-fg-muted truncate border-t border-border">
          {run.description}
        </div>
      )}
    </div>
  );
}

function TerminalLine({ event }: { event: TimelineEvent }): JSX.Element {
  const time = formatTime(event.timestamp);
  const tone = toneFor(event);
  const prefix = prefixFor(event);
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-fg-dim/70 shrink-0">{time}</span>
      <span className={cn("shrink-0", tone)}>{prefix}</span>
      <span className="truncate text-fg-muted">{event.detail || event.label}</span>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function toneFor(ev: TimelineEvent): string {
  switch (ev.kind) {
    case "tool_call":
      return "text-info";
    case "tool_result":
      return "text-success";
    case "assistant_message":
      return "text-fg";
    case "user_message":
      return "text-fg-muted";
    case "agent_error":
      return "text-danger";
    default:
      return "text-fg-dim";
  }
}

function prefixFor(ev: TimelineEvent): string {
  switch (ev.kind) {
    case "tool_call":
      return `▶ ${ev.toolName ?? "tool"}`;
    case "tool_result":
      return "←";
    case "assistant_message":
      return "·";
    case "user_message":
      return ">";
    case "agent_error":
      return "✕";
    default:
      return "·";
  }
}
