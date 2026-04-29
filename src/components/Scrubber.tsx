import { useEffect, useMemo } from "react";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatDuration } from "../lib/utils.ts";

export function Scrubber(): JSX.Element | null {
  const snapshot = useDashboard((s) => s.snapshot);
  const scrub = useDashboard((s) => s.scrub);
  const setScrub = useDashboard((s) => s.setScrub);

  const flow = snapshot?.flow;
  const events = snapshot?.recentEvents ?? [];

  const range = useMemo(() => {
    if (!flow || flow.nodes.length === 0) return null;
    let min = Infinity;
    let max = 0;
    for (const n of flow.nodes) {
      if (n.startedAt && n.startedAt < min) min = n.startedAt;
      if (n.endedAt && n.endedAt > max) max = n.endedAt;
      if (n.startedAt && n.startedAt > max) max = n.startedAt;
    }
    for (const e of events) {
      if (e.timestamp < min) min = e.timestamp;
      if (e.timestamp > max) max = e.timestamp;
    }
    if (min === Infinity || max === 0) return null;
    return { min, max: Math.max(max, Date.now()) };
  }, [flow, events]);

  // Auto-advance during playback
  useEffect(() => {
    if (!scrub.enabled || !scrub.playing || !range) return;
    const id = setInterval(() => {
      const cur = useDashboard.getState().scrub.atTime ?? range.min;
      const next = cur + 1000 * scrub.speed;
      if (next >= range.max) {
        useDashboard.getState().setScrub({ atTime: range.max, playing: false });
      } else {
        useDashboard.getState().setScrub({ atTime: next });
      }
    }, 100);
    return () => clearInterval(id);
  }, [scrub.enabled, scrub.playing, scrub.speed, range]);

  if (!range) return null;

  const span = range.max - range.min;
  const at = scrub.atTime ?? range.max;
  const pct = span > 0 ? ((at - range.min) / span) * 100 : 100;
  const fromNow = Date.now() - at;

  return (
    <div
      className={cn(
        "group/scrubber border-b border-border bg-bg-elev/30 px-4 h-9 flex items-center gap-4 text-xs",
        scrub.enabled && "bg-bg-elev/50",
      )}
    >
      <button
        onClick={() =>
          setScrub({
            enabled: !scrub.enabled,
            atTime: scrub.enabled ? null : range.max,
            playing: false,
          })
        }
        className={cn(
          "text-[9px] uppercase tracking-[0.22em] transition-colors",
          scrub.enabled
            ? "text-warning hover:text-fg"
            : "text-fg-dim hover:text-fg-muted",
        )}
      >
        {scrub.enabled ? "Live" : "Replay"}
      </button>

      {scrub.enabled && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden />
          <button
            onClick={() => setScrub({ playing: !scrub.playing })}
            className="text-[10px] uppercase tracking-[0.18em] text-fg-muted hover:text-fg transition-colors min-w-[42px] text-left"
          >
            {scrub.playing ? "Pause" : "Play"}
          </button>
          <div className="flex items-center gap-2.5 opacity-60 group-hover/scrubber:opacity-100 transition-opacity">
            {[1, 2, 4, 10].map((sp) => (
              <button
                key={sp}
                onClick={() => setScrub({ speed: sp })}
                className={cn(
                  "text-[10px] tabular tracking-tight transition-colors",
                  scrub.speed === sp
                    ? "text-fg"
                    : "text-fg-dim hover:text-fg-muted",
                )}
              >
                {sp}×
              </button>
            ))}
          </div>
        </>
      )}

      <div
        className="flex-1 relative h-5 cursor-pointer min-w-0 group/track"
        onClick={(e) => {
          if (!scrub.enabled) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          setScrub({ atTime: range.min + ratio * span });
        }}
        onMouseMove={(e) => {
          if (!scrub.enabled || e.buttons !== 1) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          setScrub({ atTime: range.min + ratio * span });
        }}
      >
        {/* track */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-border -translate-y-1/2" />

        {/* event markers */}
        {events.slice(-200).map((ev) => {
          const evPct = ((ev.timestamp - range.min) / span) * 100;
          if (evPct < 0 || evPct > 100) return null;
          return (
            <span
              key={ev.id}
              className="absolute top-1/2 -translate-y-1/2 h-1.5 w-px bg-fg-dim/50"
              style={{ left: `${evPct}%` }}
              title={ev.label}
            />
          );
        })}

        {/* progress fill */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-px left-0 transition-[width]",
            scrub.enabled ? "bg-warning/70" : "bg-fg-muted/40",
          )}
          style={{ width: `${pct}%` }}
        />

        {/* playhead */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 size-2 rounded-full transition-colors",
            scrub.enabled ? "bg-warning shadow-[0_0_6px_var(--color-warning)]" : "bg-fg-muted",
          )}
          style={{ left: `calc(${pct}% - 4px)` }}
        />
      </div>

      <div className="flex items-baseline gap-2 tabular text-[10px] shrink-0">
        <span className="text-fg-dim uppercase tracking-[0.2em] text-[9px]">at</span>
        <span className="text-fg tracking-tight">
          {scrub.enabled
            ? `−${formatDuration(fromNow)}`
            : "now"}
        </span>
        {scrub.enabled && (
          <span className="text-fg-dim">
            {new Date(at).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
