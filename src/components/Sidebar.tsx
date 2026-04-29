import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatCost, formatTokens, relativeTime } from "../lib/utils.ts";

type LaunchStatus = "launched" | "cooldown" | "error";

export function Sidebar(): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const selected = useDashboard((s) => s.selectedProjectKey);
  const select = useDashboard((s) => s.selectProject);
  const search = useDashboard((s) => s.search);
  const setSearch = useDashboard((s) => s.setSearch);
  const inputRef = useRef<HTMLInputElement>(null);
  const [launchState, setLaunchState] = useState<{ key: string; status: LaunchStatus } | null>(null);

  async function openTerminal(e: React.MouseEvent, key: string): Promise<void> {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(key)}/launch-claude`, {
        method: "POST",
      });
      const data = (await res.json()) as { status?: LaunchStatus; error?: string };
      const status: LaunchStatus = data.status ?? (data.error ? "error" : "launched");
      setLaunchState({ key, status });
      window.setTimeout(() => {
        setLaunchState((cur) => (cur && cur.key === key ? null : cur));
      }, 2500);
    } catch {
      setLaunchState({ key, status: "error" });
    }
  }

  // global "/" focus shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const projects = useMemo(() => {
    if (!snapshot) return [];
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.projects;
    return snapshot.projects.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.projectKey.toLowerCase().includes(q) ||
        p.cwd.toLowerCase().includes(q),
    );
  }, [snapshot, search]);

  if (!snapshot) {
    return <div className="p-6 text-fg-dim text-xs">loading projects…</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">Projects</span>
        <span className="text-[10px] text-fg-dim">{projects.length}/{snapshot.projects.length}</span>
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="filter…  (/)"
          className="w-full text-xs bg-bg-card border border-border rounded-md px-2.5 py-1.5 text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent/60"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-dim hover:text-fg text-xs"
          >
            ×
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {projects.map((p, i) => {
          const active = (selected ?? snapshot.activeProjectKey) === p.projectKey;
          return (
            <li key={p.projectKey}>
              <div
                className={cn(
                  "group w-full rounded-md px-3 py-2 text-xs leading-snug transition-colors",
                  "border border-transparent hover:bg-bg-hover",
                  active && "bg-bg-card border-border-strong",
                )}
              >
                <button
                  onClick={() => select(p.projectKey)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-1.5 rounded-full shrink-0",
                        p.isLive ? "bg-success pulse-soft" : "bg-fg-dim/40",
                      )}
                    />
                    <span className="truncate font-medium">{p.displayName}</span>
                    {i < 9 && (
                      <span className="ml-auto text-[8px] uppercase tracking-[0.14em] text-fg-dim shrink-0">⌥{i + 1}</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-fg-dim tabular">
                    <span>
                      {formatTokens(p.totalTokens)} · {formatCost(p.totalCost)}
                    </span>
                    <span>{p.lastActivityAt ? relativeTime(p.lastActivityAt) : "—"}</span>
                  </div>
                </button>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <button
                    onClick={(e) => void openTerminal(e, p.projectKey)}
                    title={`Open terminal in ${p.cwd} and run claude`}
                    className={cn(
                      "flex items-center gap-1 text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-sm",
                      "border border-border bg-bg-elev/60 text-fg-muted",
                      "hover:bg-accent/15 hover:border-accent/60 hover:text-accent transition-colors",
                    )}
                  >
                    <span>▸_</span>
                    <span>open terminal</span>
                  </button>
                  {launchState?.key === p.projectKey && (
                    <span
                      className={cn(
                        "text-[9px] uppercase tracking-[0.16em]",
                        launchState.status === "launched" && "text-success",
                        launchState.status === "cooldown" && "text-fg-dim",
                        launchState.status === "error" && "text-danger",
                      )}
                    >
                      {launchState.status === "launched" && "✓ opened"}
                      {launchState.status === "cooldown" && "… cooldown"}
                      {launchState.status === "error" && "✕ failed"}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {projects.length === 0 && (
          <li className="text-fg-dim text-[11px] italic px-2 py-3">no matches for "{search}"</li>
        )}
      </ul>
    </div>
  );
}
