import { useEffect, useMemo, useState } from "react";
import type { EditorFile, EditorSource } from "@shared/types.ts";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, relativeTime } from "../lib/utils.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { EditorCanvas } from "./EditorCanvas.tsx";
import { EditorPane } from "./EditorPane.tsx";

type SourceFilter = "all" | "project" | "global" | "plugin" | "obsidian";

export function EditorPage(): JSX.Element {
  const [sources, setSources] = useState<EditorSource[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const projectFilter = useDashboard((s) => s.editorProjectFilter);
  const sourceFilter = useDashboard((s) => s.editorSourceFilter) as SourceFilter;
  const search = useDashboard((s) => s.editorSearch);
  const setSearch = useDashboard((s) => s.setEditorSearch);
  const setSourceFilter = useDashboard((s) => s.setEditorSourceFilter);
  const setProjectFilter = useDashboard((s) => s.setEditorProjectFilter);
  const selectedId = useDashboard((s) => s.editorSelectedId);
  const setSelectedId = useDashboard((s) => s.setEditorSelectedId);
  const snapshot = useDashboard((s) => s.snapshot);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/editor/sources")
      .then((r) => r.json())
      .then((data: EditorSource[]) => {
        if (cancelled) return;
        setSources(data);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const filtered = useMemo(() => {
    if (!sources) return [];
    let list = sources;
    if (sourceFilter !== "all") list = list.filter((s) => s.source === sourceFilter);
    if (projectFilter) list = list.filter((s) => s.projectKey === projectFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q) ||
          s.filePath.toLowerCase().includes(q),
      );
    }
    return list;
  }, [sources, sourceFilter, projectFilter, search]);

  const selected = useMemo(
    () => filtered.find((s) => s.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  function handleSaved(_file: EditorFile): void {
    setRefreshTick((t) => t + 1);
  }

  return (
    <div className="grid h-full grid-cols-[260px_1fr_480px]">
      <aside className="border-r border-border bg-bg-elev/30 flex flex-col overflow-hidden">
        <ErrorBoundary>
          <SourceList
            sources={filtered}
            sourceFilter={sourceFilter}
            setSourceFilter={(f) => setSourceFilter(f)}
            projectFilter={projectFilter}
            setProjectFilter={setProjectFilter}
            search={search}
            setSearch={setSearch}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            snapshot={snapshot}
            loading={sources === null}
          />
        </ErrorBoundary>
      </aside>
      <main className="relative overflow-hidden bg-bg">
        <ErrorBoundary>
          <EditorCanvas
            sources={filtered}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        </ErrorBoundary>
      </main>
      <aside className="border-l border-border bg-bg-elev/30 overflow-hidden">
        <ErrorBoundary>
          <EditorPane source={selected} onSaved={handleSaved} />
        </ErrorBoundary>
      </aside>
    </div>
  );
}

function SourceList({
  sources,
  sourceFilter,
  setSourceFilter,
  projectFilter,
  setProjectFilter,
  search,
  setSearch,
  selectedId,
  setSelectedId,
  snapshot,
  loading,
}: {
  sources: EditorSource[];
  sourceFilter: SourceFilter;
  setSourceFilter: (f: SourceFilter) => void;
  projectFilter: string | null;
  setProjectFilter: (key: string | null) => void;
  search: string;
  setSearch: (s: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  snapshot: ReturnType<typeof useDashboard.getState>["snapshot"];
  loading: boolean;
}): JSX.Element {
  const filters: { key: SourceFilter; label: string }[] = [
    { key: "all", label: "all" },
    { key: "project", label: "project" },
    { key: "global", label: "global" },
    { key: "obsidian", label: "obsidian" },
    { key: "plugin", label: "plugin" },
  ];
  return (
    <div className="flex flex-col gap-2 p-3 h-full">
      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setSourceFilter(f.key)}
            className={cn(
              "text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-sm border transition-colors",
              sourceFilter === f.key
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-border text-fg-dim hover:text-fg",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {snapshot && snapshot.projects.length > 0 && (
        <select
          value={projectFilter ?? ""}
          onChange={(e) => setProjectFilter(e.target.value || null)}
          className="bg-bg-elev border border-border text-fg text-xs rounded-sm px-2 py-1 focus:outline-none focus:border-accent"
        >
          <option value="">all projects</option>
          {snapshot.projects.map((p) => (
            <option key={p.projectKey} value={p.projectKey}>
              {p.displayName}
            </option>
          ))}
        </select>
      )}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="search…"
        className="w-full text-xs bg-bg-card border border-border rounded-md px-2.5 py-1.5 text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent/60"
      />
      <ul className="flex-1 overflow-y-auto flex flex-col gap-px -mx-1 pr-1">
        {loading && (
          <li className="text-fg-dim text-[11px] italic px-3 py-2">loading sources…</li>
        )}
        {!loading && sources.length === 0 && (
          <li className="text-fg-dim text-[11px] italic px-3 py-2">no sources match</li>
        )}
        {sources.map((s) => {
          const active = s.id === selectedId;
          return (
            <li key={s.id}>
              <button
                onClick={() => setSelectedId(s.id)}
                title={s.filePath}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-sm border border-transparent",
                  "transition-colors",
                  active ? "bg-bg-card border-border-strong" : "hover:bg-bg-hover",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[8px] uppercase tracking-[0.18em] px-1 py-0.5 rounded-sm border",
                      sourceTone(s),
                    )}
                  >
                    {s.kind}
                  </span>
                  <span className="truncate text-xs font-medium">{s.name}</span>
                  {s.readonly && (
                    <span className="ml-auto text-[8px] uppercase tracking-[0.18em] text-fg-dim">
                      read-only
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-fg-dim tabular pl-1">
                  <span className="truncate">{labelFor(s)}</span>
                  <span>{s.mtimeMs ? relativeTime(s.mtimeMs) : "—"}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function sourceTone(s: EditorSource): string {
  switch (s.source) {
    case "project":
      return "border-accent/50 text-accent bg-accent/10";
    case "global":
      return "border-info/50 text-info bg-info/10";
    case "obsidian":
      return "border-warning/50 text-warning bg-warning/10";
    case "plugin":
      return "border-border text-fg-dim";
  }
}

function labelFor(s: EditorSource): string {
  if (s.source === "plugin") return s.pluginName ?? "plugin";
  if (s.source === "global") return "global";
  if (s.source === "obsidian") return "obsidian";
  return s.projectKey ? "project" : "—";
}
