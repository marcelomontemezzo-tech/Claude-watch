import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, relativeTime } from "../lib/utils.ts";
import type { TimelineEvent } from "@shared/types.ts";

const KIND_DOT: Record<TimelineEvent["kind"], string> = {
  user_message: "bg-accent",
  assistant_message: "bg-fg-muted",
  tool_call: "bg-info",
  tool_result: "bg-fg-dim",
  agent_spawn: "bg-warning",
  agent_done: "bg-success",
  agent_error: "bg-danger",
  session_start: "bg-accent",
  session_end: "bg-fg-dim",
};

export function EventTimeline(): JSX.Element {
  const events = useDashboard((s) => s.snapshot?.recentEvents ?? []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2 bg-bg-elev/40">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">Live timeline</span>
        <span className="text-[10px] text-fg-dim tabular">{events.length} events</span>
      </div>
      <ol className="flex-1 overflow-y-auto px-5 py-2 space-y-1 font-mono text-[11px] leading-relaxed">
        {[...events].reverse().map((ev) => (
          <li key={ev.id} className="flex items-start gap-3 group">
            <span className="text-fg-dim tabular shrink-0 w-16">{relativeTime(ev.timestamp)}</span>
            <span className={cn("size-1.5 rounded-full mt-1.5 shrink-0", KIND_DOT[ev.kind] ?? "bg-fg-dim")} />
            <span className="text-fg-muted shrink-0 w-32 truncate">{ev.label}</span>
            <span className="text-fg-dim flex-1 truncate group-hover:whitespace-normal group-hover:overflow-visible">
              {ev.detail ?? ""}
            </span>
          </li>
        ))}
        {events.length === 0 && (
          <li className="text-fg-dim italic">no events yet</li>
        )}
      </ol>
    </div>
  );
}
