import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  Position,
  Handle,
} from "@xyflow/react";
import dagre from "dagre";
import type { AgentRun, FlowGraph } from "@shared/types.ts";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatDuration, formatTokens } from "../lib/utils.ts";

const NODE_W = 180;
const NODE_H = 72;

function layout(graph: FlowGraph): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 32, ranksep: 56, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_W, height: NODE_H });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  const nodes: Node[] = graph.nodes.map((run) => {
    const pos = g.node(run.id);
    return {
      id: run.id,
      type: "agent",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { run },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    className: e.parallel ? "parallel" : "",
    animated: !e.parallel,
    style: {
      stroke: e.parallel ? "var(--color-info)" : "var(--color-border-strong)",
      strokeWidth: 1.5,
    },
  }));

  return { nodes, edges };
}

const nodeTypes = { agent: AgentNode };

export function AgentFlow(): JSX.Element {
  const flow = useDashboard((s) => s.snapshot?.flow ?? null);

  const layouted = useMemo(() => (flow ? layout(flow) : null), [flow]);

  if (!flow || !layouted) {
    return (
      <div className="grid h-full place-items-center text-fg-dim text-xs">
        No agents spawned yet
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={layouted.nodes}
        edges={layouted.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        zoomOnScroll
        panOnDrag
      >
        <Background gap={24} size={1} color="var(--color-border)" />
        <Controls
          showInteractive={false}
          className="!bg-bg-elev !border-border [&>button]:!bg-bg-elev [&>button]:!border-border [&>button]:!text-fg-muted"
        />
      </ReactFlow>
    </div>
  );
}

const STATUS_BADGE: Record<AgentRun["status"], string> = {
  idle: "bg-fg-dim/15 text-fg-dim",
  running: "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
  error: "bg-danger/20 text-danger",
};

function AgentNode({ data }: { data: { run: AgentRun } }): JSX.Element {
  const { run } = data;
  const isRoot = run.parentToolUseId === null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-bg-card backdrop-blur shadow-lg shadow-black/30",
        "px-3 py-2 w-[180px]",
        run.status === "running" && "border-warning/60",
        run.status === "done" && "border-border-strong",
        run.status === "error" && "border-danger/60",
        isRoot && "ring-1 ring-accent/40 bg-gradient-to-b from-bg-card to-accent/5",
      )}
      title={run.prompt ?? run.description}
    >
      <Handle type="target" position={Position.Top} className="!bg-border opacity-0" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {run.kind === "skill" && (
            <span className="text-[8px] uppercase tracking-[0.14em] px-1 py-px rounded-sm bg-info/15 text-info shrink-0">
              skill
            </span>
          )}
          {run.kind === "agent" && (
            <span className="text-[8px] uppercase tracking-[0.14em] px-1 py-px rounded-sm bg-accent/15 text-accent shrink-0">
              agent
            </span>
          )}
          <span className="text-[11px] font-medium truncate">{run.agentType}</span>
        </div>
        <span
          className={cn(
            "text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm shrink-0",
            STATUS_BADGE[run.status],
          )}
        >
          {run.status}
          {run.status === "running" && <span className="ml-1 inline-block size-1 rounded-full bg-warning pulse-soft" />}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-fg-dim tabular">
        <span className="truncate">{run.description}</span>
        <span className="shrink-0">{formatDuration(run.durationMs)}</span>
      </div>
      {!isRoot && run.parallelGroupId && (
        <div className="mt-1 inline-block text-[9px] uppercase tracking-[0.12em] text-info">
          parallel
        </div>
      )}
      {isRoot && (
        <div className="mt-1 text-[10px] tabular text-fg-muted">
          {formatTokens(run.tokens.input + run.tokens.output + run.tokens.cacheCreate + run.tokens.cacheRead)}
          <span className="text-fg-dim"> tokens</span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-border opacity-0" />
    </div>
  );
}
