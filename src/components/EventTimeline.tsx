import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, relativeTime } from "../lib/utils.ts";
import type { TimelineEvent } from "@shared/types.ts";

// Color tokens per event kind. Used for both the leading dot and the label tone.
const KIND_TONE: Record<
  TimelineEvent["kind"],
  { dot: string; label: string }
> = {
  user_message:      { dot: "bg-accent",    label: "text-fg-muted" },
  assistant_message: { dot: "bg-fg",        label: "text-fg" },
  tool_call:         { dot: "bg-info",      label: "text-info" },
  tool_result:       { dot: "bg-success",   label: "text-fg-muted" },
  agent_spawn:       { dot: "bg-warning",   label: "text-warning" },
  agent_done:        { dot: "bg-success",   label: "text-success" },
  agent_error:       { dot: "bg-danger",    label: "text-danger" },
  session_start:     { dot: "bg-accent",    label: "text-accent" },
  session_end:       { dot: "bg-fg-dim",    label: "text-fg-dim" },
};

function isErrorResult(ev: TimelineEvent): boolean {
  if (ev.kind !== "tool_result") return false;
  const d = (ev.detail ?? "").toLowerCase();
  return d.includes("error") || d.includes("failed") || d.includes("exception");
}

export function EventTimeline(): JSX.Element {
  const events = useDashboard((s) => s.snapshot?.recentEvents ?? []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5 bg-bg-elev/40">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">Live timeline</span>
        <span className="text-[10px] text-fg-dim tabular">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>
      <ol className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {[...events].reverse().map((ev, idx) => {
          const isError = isErrorResult(ev);
          const baseTone = KIND_TONE[ev.kind] ?? KIND_TONE.session_end;
          const tone = isError
            ? { ...baseTone, dot: "bg-danger", label: "text-danger" }
            : baseTone;

          return (
            <li
              key={ev.id}
              className={cn(
                "group grid items-baseline gap-x-3 px-5 py-1.5",
                "grid-cols-[4.5rem_1.25rem_minmax(0,9rem)_minmax(0,1fr)]",
                "transition-colors hover:bg-bg-hover/40",
                idx > 0 && "border-t border-border/30",
              )}
              title={ev.detail ? `${ev.label} — ${ev.detail}` : ev.label}
            >
              {/* time gutter */}
              <span
                className="text-fg-dim tabular text-[10px]"
                title={new Date(ev.timestamp).toLocaleString()}
              >
                {relativeTime(ev.timestamp)}
              </span>

              {/* glyph slot — CSS dot + tiny mark stacked optically */}
              <span className="flex items-center justify-center gap-1">
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full shrink-0", tone.dot)}
                />
              </span>

              {/* one-line label */}
              <span className={cn("truncate", tone.label)}>{ev.label}</span>

              {/* truncated detail */}
              <span
                className={cn(
                  "truncate text-fg-dim group-hover:text-fg-muted",
                  "group-hover:whitespace-normal group-hover:overflow-visible",
                )}
              >
                {ev.detail ?? ""}
              </span>
            </li>
          );
        })}
        {events.length === 0 && (
          <li className="text-fg-dim text-xs italic px-5 py-3">
            Timeline will appear once Claude takes its first action.
          </li>
        )}
      </ol>
    </div>
  );
}
