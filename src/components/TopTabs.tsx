import { useDashboard } from "../hooks/useDashboard.ts";
import { cn } from "../lib/utils.ts";

export function TopTabs(): JSX.Element {
  const tab = useDashboard((s) => s.topTab);
  const setTab = useDashboard((s) => s.setTopTab);
  const connected = useDashboard((s) => s.connected);

  return (
    <header className="flex items-center justify-between px-5 h-12 border-b border-border bg-bg">
      <div className="flex items-center gap-6">
        <div className="text-[11px] uppercase tracking-[0.28em] font-medium">
          claude<span className="text-fg-dim">·</span>watch
        </div>
        <nav className="flex items-center gap-1">
          {(["monitor", "editor"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 h-12 text-[11px] uppercase tracking-[0.18em] -mb-px border-b transition-colors",
                tab === t
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-dim hover:text-fg",
              )}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        <span
          className={cn(
            "size-1.5 rounded-full",
            connected ? "bg-success pulse-soft" : "bg-danger",
          )}
        />
        <span>{connected ? "live" : "reconnect"}</span>
      </div>
    </header>
  );
}
