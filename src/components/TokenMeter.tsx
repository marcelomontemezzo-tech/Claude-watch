import { useEffect, useState } from "react";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatCost, formatDuration, formatTokens } from "../lib/utils.ts";
import type { UsageWindow } from "@shared/types.ts";

export function TokenMeter(): JSX.Element {
  const usage = useDashboard((s) => s.snapshot?.usage);
  const session = useDashboard((s) => s.snapshot?.activeSession);

  // 1s ticker for live countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!usage) {
    return (
      <div className="col-span-3 grid place-items-center bg-bg p-10 text-fg-dim text-[10px] uppercase tracking-[0.22em]">
        Loading usage
      </div>
    );
  }

  return (
    <>
      <UsageCard
        title="Current 5-hour session"
        sublabel={`Plan ${usage.plan.toUpperCase()}`}
        window={usage.fiveHour}
        showByModel
      />
      <UsageCard
        title="Weekly · all models"
        sublabel="Rolling 7 days"
        window={usage.weeklyAll}
        showByModel
      />
      <UsageCard
        title="Weekly · Opus"
        sublabel="Opus-only quota"
        window={usage.weeklyOpus}
        accent="opus"
      />
      {session && <SessionRibbon />}
    </>
  );
}

function SessionRibbon(): JSX.Element {
  const session = useDashboard((s) => s.snapshot?.activeSession);
  if (!session) return <></>;
  const ctxPct = session.contextUsage.pct;
  const ctxTone = ctxPct >= 0.9 ? "danger" : ctxPct >= 0.7 ? "warning" : undefined;
  const totalTokens =
    session.tokens.input + session.tokens.output + session.tokens.cacheCreate + session.tokens.cacheRead;
  return (
    <div className="col-span-3 bg-bg flex items-center px-6 h-9 border-t border-border text-[11px] tabular">
      <Pill label="ctx" value={`${(ctxPct * 100).toFixed(1)}%`} tone={ctxTone} />
      <Pill label="tokens" value={formatTokens(totalTokens)} />
      <Pill label="cost" value={formatCost(session.cost.total)} />
      <Pill label="cache" value={`${(session.cacheHitRate * 100).toFixed(0)}%`} />
      <Pill label="turns" value={session.turnCount.toString()} />
      <Pill label="model" value={session.model.replace(/^claude-/, "").replace(/\[.*\]$/, "")} last />
    </div>
  );
}

function Pill({
  label,
  value,
  tone,
  last,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
  last?: boolean;
}): JSX.Element {
  return (
    <span
      className={cn(
        "flex items-baseline gap-1.5 px-5 first:pl-0 border-l border-border first:border-l-0",
        last && "ml-auto pr-0",
      )}
    >
      <span className="text-[9px] uppercase tracking-[0.2em] text-fg-dim">{label}</span>
      <span
        className={cn(
          "font-medium tracking-tight",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
          !tone && "text-fg",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function UsageCard({
  title,
  sublabel,
  window: w,
  showByModel,
  accent,
}: {
  title: string;
  sublabel: string;
  window: UsageWindow;
  showByModel?: boolean;
  accent?: "opus";
}): JSX.Element {
  const pct = w.pct * 100;
  const tone: "accent" | "warning" | "danger" = pct >= 90 ? "danger" : pct >= 70 ? "warning" : "accent";
  const heroColor =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-fg";

  return (
    <div className="bg-bg px-6 py-5 flex flex-col gap-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[9px] uppercase tracking-[0.22em] text-fg-dim">{title}</span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-fg-dim/60">{sublabel}</span>
        </div>
        <ResetCountdown ms={w.resetInMs} />
      </div>

      {/* Hero number — Stripe dashboard style */}
      <div className="flex items-baseline gap-2 -mt-1">
        <span
          className={cn(
            "text-[40px] leading-none font-semibold tabular tracking-[-0.025em]",
            heroColor,
          )}
        >
          {pct.toFixed(1)}
        </span>
        <span className={cn("text-[18px] font-medium tabular tracking-tight", heroColor)}>%</span>
        <span className="ml-auto text-[10px] text-fg-dim tabular self-end pb-1">
          <span className="text-fg-muted">{w.used.toLocaleString()}</span>
          <span> / {w.limit.toLocaleString()} {w.unit}</span>
        </span>
      </div>

      <ProgressBar pct={pct} tone={tone} />

      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-[10px] tabular">
        <Row label="tokens" value={formatTokens(w.totalTokens)} />
        <Row label="cost" value={formatCost(w.totalCost)} />
        <Row label="rate" value={`${w.burnRatePerHour.toFixed(0)}/h`} />
        <Row
          label="hits limit"
          value={
            w.projectedLimitHitMs == null
              ? "—"
              : w.projectedLimitHitMs > w.resetInMs
              ? "after reset"
              : formatDuration(w.projectedLimitHitMs)
          }
          accent={
            w.projectedLimitHitMs != null && w.projectedLimitHitMs < w.resetInMs && w.projectedLimitHitMs < 3600_000
              ? "warn"
              : undefined
          }
        />
      </div>

      {showByModel && <ModelBreakdown w={w} />}
      {accent === "opus" && w.totalTokens > 0 && (
        <div className="text-[10px] text-fg-dim leading-snug">
          Opus tokens consumed across all sessions in the last 7 days.
        </div>
      )}
    </div>
  );
}

function ModelBreakdown({ w }: { w: UsageWindow }): JSX.Element {
  const total = w.totalTokens || 1;
  const rows: { label: string; value: number; color: string }[] = [
    { label: "opus", value: w.byModel.opus, color: "var(--color-accent)" },
    { label: "sonnet", value: w.byModel.sonnet, color: "var(--color-info)" },
    { label: "haiku", value: w.byModel.haiku, color: "var(--color-success)" },
  ];
  if (w.byModel.other > 0) rows.push({ label: "other", value: w.byModel.other, color: "var(--color-fg-muted)" });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-px h-1 rounded-full overflow-hidden bg-bg-card">
        {rows.map((r) => {
          const pct = (r.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <span
              key={r.label}
              style={{ background: r.color, width: `${pct}%` }}
              className="h-full"
              title={`${r.label}: ${formatTokens(r.value)}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px] tabular">
        {rows.slice(0, 3).map((r) => (
          <div key={r.label} className="flex items-baseline gap-1.5 min-w-0">
            <span className="size-1 rounded-full shrink-0 self-center" style={{ background: r.color }} />
            <span className="text-fg-dim uppercase tracking-[0.16em] text-[9px] truncate">{r.label}</span>
            <span className="text-fg-muted ml-auto">{formatTokens(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ pct, tone }: { pct: number; tone: "accent" | "warning" | "danger" }): JSX.Element {
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    tone === "danger" ? "var(--color-danger)" :
    tone === "warning" ? "var(--color-warning)" :
    "var(--color-accent)";
  return (
    <div className="relative h-[3px] rounded-full bg-bg-card overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-500"
        style={{
          width: `${clamped}%`,
          background: color,
          boxShadow: clamped > 70 ? `0 0 8px ${color}66` : undefined,
        }}
      />
    </div>
  );
}

function ResetCountdown({ ms }: { ms: number }): JSX.Element {
  const formatted = formatCountdown(ms);
  return (
    <div className="flex flex-col items-end leading-tight shrink-0">
      <span className="text-[8.5px] uppercase tracking-[0.2em] text-fg-dim">resets in</span>
      <span className="text-[11px] tabular text-fg-muted tracking-tight">{formatted}</span>
    </div>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function Row({ label, value, accent }: { label: string; value: string; accent?: "warn" }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-fg-dim uppercase tracking-[0.16em] text-[9px]">{label}</span>
      <span className={cn("truncate tracking-tight", accent === "warn" ? "text-warning" : "text-fg-muted")}>
        {value}
      </span>
    </div>
  );
}
