import { useEffect, useMemo, useState } from "react";
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
import type {
  AgentRun,
  AgentStatus,
  Choreography as Choreo,
  ChoreographyEdge,
  ChoreographyEdgeKind,
  ChoreographyNode,
  ChoreographyPhase,
} from "@shared/types.ts";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatDuration, relativeTime } from "../lib/utils.ts";
import { LiveSubagentTerminals } from "./LiveSubagentTerminals.tsx";

const NODE_W = 156;
const NODE_H = 60;

const ROLE_STYLE: Record<ChoreographyNode["role"], string> = {
  orchestrator: "border-accent/70 bg-accent/10 text-accent",
  dispatcher: "border-info/60 bg-info/10 text-info",
  specialist: "border-border-strong bg-bg-card text-fg",
  gate: "border-danger/60 bg-danger/10 text-danger",
  support: "border-border bg-bg-elev text-fg-muted",
  tail: "border-success/60 bg-success/10 text-success",
};

const PHASE_LABEL: Record<ChoreographyPhase, string> = {
  entry: "1 · Entry",
  dispatcher: "2 · Dispatch",
  dev: "3 · Dev (parallel)",
  gate: "4 · QA gate",
  merge: "5 · Merge",
  docs: "6 · Docs",
  exit: "7 · Exit",
};

const EDGE_STYLE: Record<ChoreographyEdgeKind, { stroke: string; dashed?: boolean; opacity?: number }> = {
  dispatch: { stroke: "var(--color-accent)", opacity: 0.85 },
  parallel: { stroke: "var(--color-info)", dashed: true, opacity: 0.55 },
  sequence: { stroke: "var(--color-fg-muted)", opacity: 0.7 },
  "gate-pass": { stroke: "var(--color-success)", opacity: 0.7 },
  loopback: { stroke: "var(--color-warning)", dashed: true, opacity: 0.85 },
  escalation: { stroke: "var(--color-danger)", dashed: true, opacity: 0.9 },
  veto: { stroke: "var(--color-danger)", dashed: true, opacity: 0.5 },
};

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

function layout(choreo: Choreo, pipeline: string | null, edgeKinds: Set<ChoreographyEdgeKind>): LayoutResult {
  const visibleEdges = choreo.edges.filter((e) => {
    if (!edgeKinds.has(e.kind)) return false;
    if (e.kind === "veto") return pipeline === null || pipeline === "sensitive";
    if (e.pipeline && pipeline && e.pipeline !== pipeline) return false;
    return true;
  });

  const visibleNodes = pipeline
    ? choreo.nodes.filter(
        (n) => n.pipelines.includes(pipeline) || n.fixed || n.role === "orchestrator" || n.role === "dispatcher",
      )
    : choreo.nodes;
  const nodeIds = new Set(visibleNodes.map((n) => n.id));
  const edges = visibleEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const hasManualPositions = visibleNodes.every((n) => n.position);

  if (hasManualPositions) {
    const flowNodes: Node[] = visibleNodes.map((n) => ({
      id: n.id,
      type: "choreo",
      position: { x: n.position!.x, y: n.position!.y },
      data: { node: n },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }));
    return { nodes: flowNodes, edges: makeFlowEdges(edges) };
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 14,
    ranksep: 64,
    marginx: 24,
    marginy: 24,
    ranker: "longest-path",
  });
  g.setDefaultEdgeLabel(() => ({}));

  const phaseRank: Record<ChoreographyPhase, number> = {
    entry: 0,
    dispatcher: 1,
    dev: 2,
    gate: 3,
    merge: 4,
    docs: 5,
    exit: 6,
  };

  for (const n of visibleNodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H, rank: phaseRank[n.phase] });
  }
  for (const e of edges) {
    if (e.kind === "loopback" || e.kind === "escalation") {
      g.setEdge(e.source, e.target, { weight: 0, minlen: 1 });
    } else {
      g.setEdge(e.source, e.target);
    }
  }
  dagre.layout(g);

  const flowNodes: Node[] = visibleNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: "choreo",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { node: n },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  return { nodes: flowNodes, edges: makeFlowEdges(edges) };
}

function makeFlowEdges(edges: ChoreographyEdge[]): Edge[] {
  return edges.map((e, idx) => {
    const style = EDGE_STYLE[e.kind];
    const isArc = e.kind === "loopback" || e.kind === "escalation";
    return {
      id: `${e.kind}:${e.source}->${e.target}:${idx}`,
      source: e.source,
      target: e.target,
      sourceHandle: isArc ? "top" : undefined,
      targetHandle: isArc ? "top" : undefined,
      type: isArc ? "smoothstep" : "default",
      pathOptions: isArc ? { borderRadius: 28, offset: 80 } : undefined,
      animated: e.kind === "parallel" || e.kind === "loopback",
      label: e.label,
      labelBgPadding: [6, 3],
      labelStyle: {
        fontSize: 10,
        fontWeight: 600,
        fill: isArc ? style.stroke : "var(--color-fg-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
      },
      labelBgStyle: {
        fill: "var(--color-bg)",
        stroke: isArc ? style.stroke : "transparent",
        strokeWidth: isArc ? 1 : 0,
        rx: 4,
        opacity: 0.95,
      },
      style: {
        stroke: style.stroke,
        strokeWidth: isArc ? 1.8 : 1.4,
        strokeDasharray: style.dashed ? "5 4" : undefined,
        opacity: style.opacity ?? 0.7,
      },
    };
  });
}

const nodeTypes = { choreo: ChoreographyNodeView };

const ALL_KINDS: ChoreographyEdgeKind[] = [
  "dispatch",
  "parallel",
  "sequence",
  "gate-pass",
  "loopback",
  "escalation",
  "veto",
];

export function Choreography(): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const connected = useDashboard((s) => s.connected);
  const selected = useDashboard((s) => s.selectedProjectKey);
  const flow = snapshot?.flow;
  const key = selected ?? snapshot?.activeProjectKey ?? null;
  const choreo = key ? snapshot?.choreographyByProject?.[key] : undefined;

  const pipeline = useDashboard((s) => s.pipelineFilter);
  const setPipeline = useDashboard((s) => s.setPipelineFilter);
  const scrub = useDashboard((s) => s.scrub);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const statusByAgent = useMemo(() => {
    const map = new Map<string, { status: AgentStatus; run: AgentRun }>();
    if (!flow) return map;
    const cutoff = scrub.enabled && scrub.atTime != null ? scrub.atTime : null;
    for (const n of flow.nodes) {
      if (n.parentToolUseId === null) continue;
      let status: AgentStatus = n.status;
      if (cutoff != null) {
        if (n.startedAt > cutoff) continue; // not started yet at scrub time
        if (n.endedAt && n.endedAt <= cutoff) status = n.status === "error" ? "error" : "done";
        else status = "running";
      }
      const prev = map.get(n.agentType);
      if (!prev) {
        map.set(n.agentType, { status, run: n });
        continue;
      }
      const priority: Record<AgentStatus, number> = { running: 3, error: 2, done: 1, idle: 0 };
      if (priority[status] > priority[prev.status]) {
        map.set(n.agentType, { status, run: n });
      } else if (priority[status] === priority[prev.status] && n.startedAt > prev.run.startedAt) {
        map.set(n.agentType, { status, run: n });
      }
    }
    return map;
  }, [flow, scrub.enabled, scrub.atTime]);

  const runningCount = useMemo(
    () => Array.from(statusByAgent.values()).filter((s) => s.status === "running").length,
    [statusByAgent],
  );
  const lastActivity = useMemo(() => {
    let max = 0;
    for (const s of statusByAgent.values()) {
      if (s.run.endedAt && s.run.endedAt > max) max = s.run.endedAt;
      if (s.run.startedAt > max) max = s.run.startedAt;
    }
    return max;
  }, [statusByAgent]);

  const layouted = useMemo(
    () => (choreo ? layout(choreo, pipeline, new Set(ALL_KINDS)) : null),
    [choreo, pipeline],
  );

  if (!snapshot || !connected) {
    return <ChoreographySkeleton />;
  }

  if (!key) {
    return (
      <div className="grid h-full place-items-center px-8">
        <p className="text-fg-dim text-xs italic">
          Select a project to inspect its choreography.
        </p>
      </div>
    );
  }

  if (!choreo || !layouted) {
    return (
      <div className="grid h-full place-items-center px-8">
        <p className="text-fg-dim text-xs italic">
          Choreography unavailable. Project has no `agent-*` skills.
        </p>
      </div>
    );
  }

  const runningList = Array.from(statusByAgent.entries())
    .filter(([, v]) => v.status === "running")
    .map(([agentId, v]) => ({ agentId, run: v.run }));

  return (
    <div className="flex h-full flex-col">
      <LiveBanner running={runningList} lastActivity={lastActivity} statusByAgent={statusByAgent} />
      <div className="flex items-center gap-5 border-b border-border px-4 h-9 bg-bg-elev/30 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.22em] text-fg-dim mr-1">Pipeline</span>
          <PipelineChip label="all" id={null} active={pipeline} onSelect={setPipeline} />
          {choreo.pipelines.map((p) => (
            <PipelineChip
              key={p.id}
              id={p.id}
              label={p.label}
              description={p.description}
              active={pipeline}
              onSelect={setPipeline}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-[9px] uppercase tracking-[0.18em] text-fg-dim border-l border-border pl-5">
          <Legend swatch="var(--color-accent)" label="dispatch" />
          <Legend swatch="var(--color-info)" label="parallel" dashed />
          <Legend swatch="var(--color-fg-muted)" label="sequence" />
          <Legend swatch="var(--color-success)" label="pass" />
          <Legend swatch="var(--color-warning)" label="loop" dashed />
          <Legend swatch="var(--color-danger)" label="escalate" dashed />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlow
          onNodeClick={(_e, n) => {
            const node = (n.data as { node?: ChoreographyNode }).node;
            if (node) useDashboard.getState().openAgentModal(node.agentId);
          }}
          nodes={layouted.nodes.map((n) => {
            const node = (n.data as { node: ChoreographyNode }).node;
            const statusEntry = statusByAgent.get(node.agentId);
            return {
              ...n,
              data: {
                ...(n.data as object),
                runtime: statusEntry,
              },
            };
          })}
          edges={layouted.edges.map((e) => {
            const sourceNode = layouted.nodes.find((n) => n.id === e.source);
            const targetNode = layouted.nodes.find((n) => n.id === e.target);
            const sourceAgent = (sourceNode?.data as { node: ChoreographyNode } | undefined)?.node.agentId;
            const targetAgent = (targetNode?.data as { node: ChoreographyNode } | undefined)?.node.agentId;
            const sourceStatus = sourceAgent ? statusByAgent.get(sourceAgent)?.status : undefined;
            const targetStatus = targetAgent ? statusByAgent.get(targetAgent)?.status : undefined;
            const isActive = sourceStatus === "running" || targetStatus === "running";
            if (!isActive) return e;
            return {
              ...e,
              animated: true,
              style: {
                ...(e.style ?? {}),
                stroke: "var(--color-warning)",
                strokeWidth: 2.4,
                opacity: 1,
                filter: "drop-shadow(0 0 6px var(--color-warning))",
              },
            };
          })}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.08, maxZoom: 0.85, minZoom: 0.3 }}
          minZoom={0.25}
          maxZoom={1.4}
          defaultEdgeOptions={{ type: "default" }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
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
      </div>
      <LiveSubagentTerminals />
    </div>
  );
}

function ChoreographySkeleton(): JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-2 bg-bg-elev/40 flex items-center gap-3">
        <div className="bg-bg-elev/60 animate-pulse rounded-md h-4 w-20" />
        <div className="bg-bg-elev/60 animate-pulse rounded-md h-4 w-32" />
      </div>
      <div className="border-b border-border px-4 py-2 bg-bg-elev/40 flex items-center gap-2">
        {[40, 60, 56, 48].map((w, i) => (
          <div key={i} className="bg-bg-elev/60 animate-pulse rounded-sm h-5" style={{ width: w }} />
        ))}
      </div>
      <div className="flex-1 grid place-items-center">
        <div className="grid grid-cols-4 gap-6 px-8">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="bg-bg-elev/60 animate-pulse rounded-md h-[60px] w-[156px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

function PipelineChip({
  id,
  label,
  description,
  active,
  onSelect,
}: {
  id: string | null;
  label: string;
  description?: string;
  active: string | null;
  onSelect: (id: string | null) => void;
}): JSX.Element {
  const isActive = active === id;
  return (
    <button
      onClick={() => onSelect(id)}
      title={description}
      className={cn(
        "text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-xs border transition-colors",
        isActive
          ? "border-accent/70 text-accent bg-accent/5"
          : "border-transparent text-fg-dim hover:text-fg-muted hover:border-border",
      )}
    >
      {label}
    </button>
  );
}

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-3.5 h-px"
        style={{
          background: dashed
            ? `repeating-linear-gradient(to right, ${swatch} 0 3px, transparent 3px 6px)`
            : swatch,
        }}
      />
      <span>{label}</span>
    </span>
  );
}

const STATUS_RING: Record<AgentStatus, string> = {
  idle: "",
  running: "ring-2 ring-warning shadow-[0_0_18px_var(--color-warning)] node-running-pulse",
  done: "ring-1 ring-success/60",
  error: "ring-2 ring-danger shadow-[0_0_14px_var(--color-danger)]",
};

const STATUS_DOT: Record<AgentStatus, { color: string; label: string }> = {
  idle: { color: "bg-fg-dim/40", label: "idle" },
  running: { color: "bg-warning pulse-soft", label: "running" },
  done: { color: "bg-success", label: "done" },
  error: { color: "bg-danger", label: "error" },
};

function ChoreographyNodeView({
  data,
}: {
  data: { node: ChoreographyNode; runtime?: { status: AgentStatus; run: AgentRun } };
}): JSX.Element {
  const { node, runtime } = data;
  const status: AgentStatus = runtime?.status ?? "idle";
  const dot = STATUS_DOT[status];
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 w-[156px] text-xs shadow-sm shadow-black/40 relative transition-all cursor-pointer hover:bg-bg-hover",
        ROLE_STYLE[node.role],
        STATUS_RING[status],
        node.fixed && status === "idle" && "ring-1 ring-fg-dim/30",
      )}
      title={`${node.description ?? ""} · click to open`}
    >
      <Handle type="target" position={Position.Left} className="!bg-border opacity-0" />
      <Handle type="target" id="top" position={Position.Top} className="!bg-border opacity-0" />
      <Handle type="source" id="top" position={Position.Top} className="!bg-border opacity-0" />
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-medium truncate tracking-tight">{node.name}</span>
        <span className={cn("size-1.5 rounded-full shrink-0", dot.color)} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[8px] uppercase tracking-[0.18em] opacity-65">
        <span>{PHASE_LABEL[node.phase]}</span>
        {status !== "idle" ? (
          <span
            className={cn(
              "font-semibold tabular",
              status === "running" && "text-warning",
              status === "done" && "text-success",
              status === "error" && "text-danger",
            )}
          >
            {dot.label}
            {runtime?.run?.durationMs != null && status !== "running" && (
              <span className="ml-1 opacity-70">{formatDuration(runtime.run.durationMs)}</span>
            )}
          </span>
        ) : (
          node.fixed && <span className="opacity-60">fixed</span>
        )}
      </div>
      {status === "running" && runtime?.run && (
        <div className="mt-0.5 text-[9px] text-warning tabular">
          {formatDuration(Date.now() - runtime.run.startedAt)}
        </div>
      )}
      {node.parallelWith && node.parallelWith.length > 0 && status === "idle" && (
        <div className="mt-0.5 text-[8px] text-info/70 truncate">
          {node.parallelWith.map((p) => p.replace(/^agent-/, "")).join(" · ")}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-border opacity-0" />
    </div>
  );
}

function LiveBanner({
  running,
  lastActivity,
  statusByAgent,
}: {
  running: { agentId: string; run: AgentRun }[];
  lastActivity: number;
  statusByAgent: Map<string, { status: AgentStatus; run: AgentRun }>;
}): JSX.Element {
  const totals = { running: 0, done: 0, error: 0, idle: 0 };
  for (const v of statusByAgent.values()) totals[v.status] += 1;

  const live = running.length > 0;
  return (
    <div
      className={cn(
        "border-b border-border px-4 h-9 flex items-center gap-5 text-xs",
        live ? "bg-warning/[0.06]" : "bg-bg-elev/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-1.5 rounded-full",
            live ? "bg-warning pulse-soft" : "bg-fg-dim/40",
          )}
        />
        <span
          className={cn(
            "text-[9px] uppercase tracking-[0.22em]",
            live ? "text-warning" : "text-fg-dim",
          )}
        >
          {live ? "live" : "idle"}
        </span>
      </div>
      <div className="flex items-center gap-4 text-[10px] tabular text-fg-muted border-l border-border pl-5">
        <Tally label="running" value={totals.running} accent="warning" />
        <Tally label="done" value={totals.done} accent="success" />
        {totals.error > 0 && <Tally label="error" value={totals.error} accent="danger" />}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden border-l border-border pl-5">
        {!live ? (
          <span className="text-fg-dim text-[10px] uppercase tracking-[0.18em]">no subagents running</span>
        ) : (
          <ul className="flex items-center gap-1.5 overflow-x-auto">
            {running.map(({ agentId, run }) => (
              <li
                key={run.id}
                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs border border-warning/30 bg-warning/[0.06] text-warning text-[10px] whitespace-nowrap"
              >
                <span className="size-1 rounded-full bg-warning pulse-soft" />
                <span className="font-medium tracking-tight">{agentId.replace(/^agent-/, "")}</span>
                <span className="opacity-70 tabular">
                  {formatDuration(Date.now() - run.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {lastActivity > 0 && (
        <span className="text-[10px] text-fg-dim tabular shrink-0 border-l border-border pl-5">
          last {relativeTime(lastActivity)}
        </span>
      )}
    </div>
  );
}

function Tally({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "warning" | "success" | "danger";
}): JSX.Element {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "size-1 rounded-full self-center",
          accent === "warning" && "bg-warning",
          accent === "success" && "bg-success",
          accent === "danger" && "bg-danger",
        )}
      />
      <span className="text-fg text-[11px] tabular font-medium">{value}</span>
      <span className="text-fg-dim uppercase tracking-[0.18em] text-[9px]">{label}</span>
    </span>
  );
}
