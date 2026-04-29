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
    <div className="border-b border-border bg-bg-elev/40 px-4 py-2 flex items-center gap-3 text-xs">
      <button
        onClick={() => setScrub({ enabled: !scrub.enabled, atTime: scrub.enabled ? null : range.max, playing: false })}
        className={cn(
          "text-[10px] uppercase tracking-[0.16em] px-2 py-1 rounded-sm border",
          scrub.enabled
            ? "border-warning/60 bg-warning/10 text-warning"
            : "border-border bg-bg-card text-fg-muted hover:bg-bg-hover",
        )}
      >
        {scrub.enabled ? "live ←" : "→ replay"}
      </button>

      {scrub.enabled && (
        <>
          <button
            onClick={() => setScrub({ playing: !scrub.playing })}
            className="text-[10px] px-2 py-1 rounded-sm border border-border bg-bg-card text-fg-muted hover:bg-bg-hover"
          >
            {scrub.playing ? "▌▌ pause" : "▶ play"}
          </button>
          <div className="flex items-center gap-1">
            {[1, 2, 4, 10].map((sp) => (
              <button
                key={sp}
                onClick={() => setScrub({ speed: sp })}
                className={cn(
                  "text-[9px] tabular px-1.5 py-0.5 rounded-sm border",
                  scrub.speed === sp
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-bg-card text-fg-muted hover:bg-bg-hover",
                )}
              >
                {sp}×
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex-1 relative h-6 bg-bg-card rounded-sm cursor-pointer min-w-0"
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
        {/* event markers */}
        {events.slice(-200).map((ev) => {
          const evPct = ((ev.timestamp - range.min) / span) * 100;
          if (evPct < 0 || evPct > 100) return null;
          return (
            <span
              key={ev.id}
              className="absolute top-1 bottom-1 w-px bg-fg-dim/40"
              style={{ left: `${evPct}%` }}
              title={ev.label}
            />
          );
        })}
        {/* progress fill */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-accent/15 rounded-sm transition-[width]"
          style={{ width: `${pct}%` }}
        />
        {/* playhead */}
        <div
          className={cn(
            "absolute top-0 bottom-0 w-0.5",
            scrub.enabled ? "bg-warning" : "bg-accent",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="flex flex-col items-end leading-tight tabular text-[10px] shrink-0">
        <span className="text-fg-dim uppercase tracking-[0.16em]">at</span>
        <span className="text-fg-muted">
          {scrub.enabled
            ? `−${formatDuration(fromNow)} (${new Date(at).toLocaleTimeString()})`
            : "now"}
        </span>
      </div>
    </div>
  );
}
