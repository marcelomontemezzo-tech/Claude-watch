import { useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
  Handle,
} from "@xyflow/react";
import type { EditorSource } from "@shared/types.ts";
import { cn } from "../lib/utils.ts";

const NODE_W = 200;
const NODE_H = 64;
const COLS = 6;
const GAP_X = 24;
const GAP_Y = 24;

const LAYOUT_KEY = "claude-watch-editor-layout";

function loadLayout(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveLayout(layout: Record<string, { x: number; y: number }>): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {}
}

export function EditorCanvas({
  sources,
  selectedId,
  setSelectedId,
}: {
  sources: EditorSource[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
}): JSX.Element {
  const layoutRef = useRef<Record<string, { x: number; y: number }>>(loadLayout());

  const nodes: Node[] = useMemo(() => {
    return sources.map((s, i) => {
      const stored = layoutRef.current[s.id];
      const fallback = {
        x: (i % COLS) * (NODE_W + GAP_X),
        y: Math.floor(i / COLS) * (NODE_H + GAP_Y),
      };
      const pos = stored ?? fallback;
      return {
        id: s.id,
        type: "editorCard",
        position: pos,
        data: { source: s, isActive: s.id === selectedId },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      };
    });
  }, [sources, selectedId]);

  const edges: Edge[] = useMemo(() => [], []);

  useEffect(() => {
    // Persist when sources list changes (initial layout for new ids)
    let dirty = false;
    sources.forEach((s, i) => {
      if (!layoutRef.current[s.id]) {
        layoutRef.current[s.id] = {
          x: (i % COLS) * (NODE_W + GAP_X),
          y: Math.floor(i / COLS) * (NODE_H + GAP_Y),
        };
        dirty = true;
      }
    });
    if (dirty) saveLayout(layoutRef.current);
  }, [sources]);

  if (sources.length === 0) {
    return (
      <div className="grid h-full place-items-center text-fg-dim text-xs italic">
        select a filter to populate the canvas
      </div>
    );
  }

  const CANVAS_CAP = 120;
  if (sources.length > CANVAS_CAP) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div className="flex flex-col items-center gap-2 max-w-md">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            {sources.length} sources
          </span>
          <p className="text-fg-muted text-sm">
            Canvas hides above {CANVAS_CAP} items to stay smooth.
          </p>
          <p className="text-fg-dim text-xs italic">
            Filter by source, project, or search to bring the canvas back.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={{ editorCard: EditorNode }}
      onNodeClick={(_e, n) => setSelectedId(n.id)}
      onNodeDragStop={(_e, n) => {
        layoutRef.current[n.id] = { x: n.position.x, y: n.position.y };
        saveLayout(layoutRef.current);
      }}
      fitView
      fitViewOptions={{ padding: 0.1, maxZoom: 1, minZoom: 0.3 }}
      minZoom={0.25}
      maxZoom={1.4}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      edgesFocusable={false}
      panOnDrag
      zoomOnScroll
    >
      <Background gap={24} size={1} color="var(--color-border)" />
      <Controls
        showInteractive={false}
        className="!bg-bg-elev !border-border [&>button]:!bg-bg-elev [&>button]:!border-border [&>button]:!text-fg-muted"
      />
    </ReactFlow>
  );
}

function EditorNode({
  data,
}: {
  data: { source: EditorSource; isActive: boolean };
}): JSX.Element {
  const s = data.source;
  return (
    <div
      className={cn(
        "rounded-md border bg-bg-card text-xs px-3 py-2 shadow-md shadow-black/30 cursor-pointer transition-colors",
        "hover:bg-bg-hover",
        data.isActive ? "border-accent ring-1 ring-accent/40" : "border-border",
      )}
      style={{ width: NODE_W, height: NODE_H }}
      title={s.filePath}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-[8px] uppercase tracking-[0.18em] px-1 py-0.5 rounded-sm border",
            tone(s),
          )}
        >
          {s.kind}
        </span>
        <span className="truncate font-medium">{s.name}</span>
        {s.readonly && (
          <span className="ml-auto text-[7px] uppercase tracking-[0.14em] text-fg-dim shrink-0">
            ro
          </span>
        )}
      </div>
      <div className="mt-1 text-[10px] text-fg-dim truncate">
        {s.description ?? labelFor(s)}
      </div>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

function tone(s: EditorSource): string {
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
