import type {
  AgentDefinition,
  Choreography,
  ChoreographyEdge,
  ChoreographyNode,
  ChoreographyPhase,
  ChoreographyRole,
} from "@shared/types.ts";

const PHASES: { id: ChoreographyPhase; label: string }[] = [
  { id: "entry", label: "Entry" },
  { id: "dispatcher", label: "Dispatch" },
  { id: "dev", label: "Dev (parallel)" },
  { id: "gate", label: "QA gate" },
  { id: "merge", label: "Merge" },
  { id: "docs", label: "Documentation" },
  { id: "exit", label: "Exit" },
];

const PIPELINES = [
  { id: "default", label: "Default", description: "Architect → DBA → Backend → Frontend → QA" },
  { id: "sensitive", label: "Sensitive", description: "Adds Security gate (auth / PII / payment / cross-tenant)" },
  { id: "automation", label: "Automation", description: "n8n workflows + cron + event-driven" },
  { id: "ai", label: "AI / Copilot", description: "RAG / embeddings / prompt engineering" },
];

const COL_X = {
  entry: 60,
  dispatcher: 280,
  devLeft: 520,
  devRight: 760,
  gate: 1020,
  merge: 1260,
  loopback: 1480,
  docs: 1480,
  exit: 1700,
};

// Y rows. Parallel pairs share Y. Sequential pairs share Y too (so chain reads horizontally).
const ROW = {
  // cluster data-api
  architect: 80,
  dba: 200,
  backend: 200,        // dba → backend (same Y)
  integrations: 320,
  // cluster ui  (design ∥ ux-ui share Y at top of pair, frontend lateral)
  design: 480,
  uxui: 560,
  frontend: 520,       // converges from design+ux-ui
  // security gate spans middle
  security: 680,
  // cluster intelligence (ai ∥ automation parallel)
  ai: 800,
  automation: 880,
  data: 840,
  // cluster ops
  infra: 1000,
  devex: 1000,         // ∥ infra → same Y
  observability: 1080,
};

const CENTER_Y = 580;

interface DevPlacement {
  agent: string;
  cluster: string;
  col: "devLeft" | "devRight";
  y: number;
}

const DEV_LAYOUT: DevPlacement[] = [
  { agent: "agent-architect", cluster: "architecture", col: "devLeft", y: ROW.architect },
  { agent: "agent-dba", cluster: "data-api", col: "devLeft", y: ROW.dba },
  { agent: "agent-backend", cluster: "data-api", col: "devRight", y: ROW.backend },
  { agent: "agent-integrations", cluster: "data-api", col: "devRight", y: ROW.integrations },
  { agent: "agent-design", cluster: "ui", col: "devLeft", y: ROW.design },
  { agent: "agent-ux-ui", cluster: "ui", col: "devLeft", y: ROW.uxui },
  { agent: "agent-frontend", cluster: "ui", col: "devRight", y: ROW.frontend },
  { agent: "agent-security", cluster: "security", col: "devLeft", y: ROW.security },
  { agent: "agent-ai", cluster: "intelligence", col: "devLeft", y: ROW.ai },
  { agent: "agent-automation", cluster: "intelligence", col: "devLeft", y: ROW.automation },
  { agent: "agent-data", cluster: "intelligence", col: "devRight", y: ROW.data },
  { agent: "agent-infra", cluster: "ops", col: "devLeft", y: ROW.infra },
  { agent: "agent-devex", cluster: "ops", col: "devRight", y: ROW.devex },
  { agent: "agent-observability", cluster: "ops", col: "devRight", y: ROW.observability },
];

const CONDUCTOR_2_ID = "agent-conductor#2";

const ROLE_DEFAULTS: Record<string, { phase: ChoreographyPhase; role: ChoreographyRole; fixed: boolean }> = {
  "agent-conductor": { phase: "entry", role: "orchestrator", fixed: true },
  "agent-prompt-engineer": { phase: "dispatcher", role: "dispatcher", fixed: true },
  "agent-architect": { phase: "dev", role: "specialist", fixed: false },
  "agent-dba": { phase: "dev", role: "specialist", fixed: false },
  "agent-backend": { phase: "dev", role: "specialist", fixed: false },
  "agent-integrations": { phase: "dev", role: "specialist", fixed: false },
  "agent-design": { phase: "dev", role: "specialist", fixed: false },
  "agent-ux-ui": { phase: "dev", role: "specialist", fixed: false },
  "agent-frontend": { phase: "dev", role: "specialist", fixed: false },
  "agent-security": { phase: "dev", role: "gate", fixed: false },
  "agent-ai": { phase: "dev", role: "specialist", fixed: false },
  "agent-automation": { phase: "dev", role: "specialist", fixed: false },
  "agent-data": { phase: "dev", role: "specialist", fixed: false },
  "agent-infra": { phase: "dev", role: "specialist", fixed: false },
  "agent-devex": { phase: "dev", role: "support", fixed: false },
  "agent-observability": { phase: "dev", role: "support", fixed: false },
  "agent-qa": { phase: "gate", role: "gate", fixed: true },
  "agent-documenter": { phase: "docs", role: "tail", fixed: true },
  "agent-versioner": { phase: "exit", role: "tail", fixed: true },
};

const PIPELINE_MEMBERS: Record<string, string[]> = {
  default: ["agent-conductor", "agent-prompt-engineer", "agent-architect", "agent-dba", "agent-backend", "agent-frontend", "agent-qa", "agent-documenter", "agent-versioner"],
  sensitive: [
    "agent-conductor",
    "agent-prompt-engineer",
    "agent-architect",
    "agent-security",
    "agent-dba",
    "agent-backend",
    "agent-frontend",
    "agent-qa",
    "agent-documenter",
    "agent-versioner",
  ],
  automation: ["agent-conductor", "agent-prompt-engineer", "agent-architect", "agent-automation", "agent-backend", "agent-qa", "agent-documenter", "agent-versioner"],
  ai: ["agent-conductor", "agent-prompt-engineer", "agent-ai", "agent-security", "agent-backend", "agent-frontend", "agent-qa", "agent-documenter", "agent-versioner"],
};

const PARALLEL_PAIRS: [string, string][] = [["agent-design", "agent-ux-ui"]];

function isHighermindLayout(agents: AgentDefinition[]): boolean {
  const names = new Set(agents.filter((a) => a.source === "project").map((a) => a.name));
  return (
    names.has("agent-conductor") &&
    names.has("agent-prompt-engineer") &&
    names.has("agent-qa") &&
    names.has("agent-documenter") &&
    names.has("agent-versioner")
  );
}

function descFor(agentId: string, defs: Map<string, string | undefined>): string | undefined {
  return defs.get(agentId);
}

export function buildChoreography(agents: AgentDefinition[]): Choreography | null {
  const projectAgents = agents.filter(
    (a) => a.source === "project" && a.kind === "skill" && a.name.startsWith("agent-"),
  );
  if (projectAgents.length === 0) return null;

  const descMap = new Map<string, string | undefined>();
  for (const a of projectAgents) descMap.set(a.name, a.description);

  if (!isHighermindLayout(projectAgents)) return buildGenericChoreography(projectAgents);

  const present = new Set(projectAgents.map((a) => a.name));
  const nodes: ChoreographyNode[] = [];
  const edges: ChoreographyEdge[] = [];

  const pipelinesForAgent: Record<string, string[]> = {};
  for (const [pipelineId, members] of Object.entries(PIPELINE_MEMBERS)) {
    for (const m of members) {
      (pipelinesForAgent[m] = pipelinesForAgent[m] ?? []).push(pipelineId);
    }
  }

  function addNode(node: ChoreographyNode): void {
    nodes.push(node);
  }

  // Phase 1: Entry — Conductor anchored far left, vertical center
  if (present.has("agent-conductor")) {
    addNode({
      id: "agent-conductor",
      agentId: "agent-conductor",
      name: "conductor",
      phase: "entry",
      role: "orchestrator",
      fixed: true,
      pipelines: pipelinesForAgent["agent-conductor"] ?? [],
      description: descFor("agent-conductor", descMap),
      position: { x: COL_X.entry, y: CENTER_Y },
    });
  }

  // Phase 2: Dispatcher
  if (present.has("agent-prompt-engineer")) {
    addNode({
      id: "agent-prompt-engineer",
      agentId: "agent-prompt-engineer",
      name: "prompt-engineer",
      phase: "dispatcher",
      role: "dispatcher",
      fixed: true,
      pipelines: pipelinesForAgent["agent-prompt-engineer"] ?? [],
      description: descFor("agent-prompt-engineer", descMap),
      position: { x: COL_X.dispatcher, y: CENTER_Y },
    });
  }

  // Phase 3: Dev cluster with manual layout
  for (const placement of DEV_LAYOUT) {
    if (!present.has(placement.agent)) continue;
    const meta = ROLE_DEFAULTS[placement.agent] ?? { phase: "dev" as const, role: "specialist" as const, fixed: false };
    addNode({
      id: placement.agent,
      agentId: placement.agent,
      name: placement.agent.replace(/^agent-/, ""),
      phase: meta.phase,
      role: meta.role,
      cluster: placement.cluster,
      fixed: meta.fixed,
      parallelWith: PARALLEL_PAIRS.filter(([x, y]) => x === placement.agent || y === placement.agent).map(
        ([x, y]) => (x === placement.agent ? y : x),
      ),
      pipelines: pipelinesForAgent[placement.agent] ?? [],
      description: descFor(placement.agent, descMap),
      position: { x: COL_X[placement.col], y: placement.y },
    });
  }

  // Phase 4: QA — single condensed gate node
  if (present.has("agent-qa")) {
    addNode({
      id: "agent-qa",
      agentId: "agent-qa",
      name: "qa",
      phase: "gate",
      role: "gate",
      fixed: true,
      pipelines: pipelinesForAgent["agent-qa"] ?? [],
      description: descFor("agent-qa", descMap),
      position: { x: COL_X.gate, y: CENTER_Y },
    });
  }

  // Phase 5: Merge — Conductor #2 receives QA outcomes, decides docs vs loopback vs escalate
  if (present.has("agent-conductor")) {
    addNode({
      id: CONDUCTOR_2_ID,
      agentId: "agent-conductor",
      name: "conductor 2",
      phase: "merge",
      role: "orchestrator",
      fixed: true,
      pipelines: pipelinesForAgent["agent-conductor"] ?? [],
      description: "Merge node — collects QA outcomes and routes (docs / loopback / escalate)",
      position: { x: COL_X.merge, y: CENTER_Y },
    });
  }

  // Phase 6: Documenter
  if (present.has("agent-documenter")) {
    addNode({
      id: "agent-documenter",
      agentId: "agent-documenter",
      name: "documenter",
      phase: "docs",
      role: "tail",
      fixed: true,
      pipelines: pipelinesForAgent["agent-documenter"] ?? [],
      description: descFor("agent-documenter", descMap),
      position: { x: COL_X.docs, y: CENTER_Y },
    });
  }

  // Phase 7: Versioner
  if (present.has("agent-versioner")) {
    addNode({
      id: "agent-versioner",
      agentId: "agent-versioner",
      name: "versioner",
      phase: "exit",
      role: "tail",
      fixed: true,
      pipelines: pipelinesForAgent["agent-versioner"] ?? [],
      description: descFor("agent-versioner", descMap),
      position: { x: COL_X.exit, y: CENTER_Y },
    });
  }

  // === EDGES ===

  if (present.has("agent-conductor") && present.has("agent-prompt-engineer")) {
    edges.push({
      source: "agent-conductor",
      target: "agent-prompt-engineer",
      kind: "dispatch",
      label: "brief",
    });
  }

  // Prompt Engineer → each dev placement
  for (const placement of DEV_LAYOUT) {
    if (!present.has(placement.agent) || !present.has("agent-prompt-engineer")) continue;
    edges.push({
      source: "agent-prompt-engineer",
      target: placement.agent,
      kind: "parallel",
    });
  }

  // Intra-dev sequence
  if (present.has("agent-dba") && present.has("agent-backend")) {
    edges.push({ source: "agent-dba", target: "agent-backend", kind: "sequence", label: "schema" });
  }
  if (present.has("agent-design") && present.has("agent-frontend")) {
    edges.push({ source: "agent-design", target: "agent-frontend", kind: "sequence", label: "design" });
  }
  if (present.has("agent-ux-ui") && present.has("agent-frontend")) {
    edges.push({ source: "agent-ux-ui", target: "agent-frontend", kind: "sequence", label: "ux" });
  }

  // Security veto edges (sensitive pipeline)
  if (present.has("agent-security")) {
    for (const target of ["agent-backend", "agent-frontend", "agent-infra", "agent-dba"]) {
      if (present.has(target)) {
        edges.push({
          source: "agent-security",
          target,
          kind: "veto",
          pipeline: "sensitive",
          label: "veto",
        });
      }
    }
  }

  // Dev → single QA
  if (present.has("agent-qa")) {
    for (const placement of DEV_LAYOUT) {
      if (!present.has(placement.agent)) continue;
      edges.push({
        source: placement.agent,
        target: "agent-qa",
        kind: "gate-pass",
        label: "report",
      });
    }
  }

  // QA → Conductor#2
  if (present.has("agent-qa") && present.has("agent-conductor")) {
    edges.push({
      source: "agent-qa",
      target: CONDUCTOR_2_ID,
      kind: "gate-pass",
      label: "verdict",
    });
  }

  // Conductor#2 routes
  if (present.has("agent-conductor") && present.has("agent-documenter")) {
    edges.push({
      source: CONDUCTOR_2_ID,
      target: "agent-documenter",
      kind: "gate-pass",
      label: "approved",
    });
  }
  if (present.has("agent-conductor") && present.has("agent-prompt-engineer")) {
    edges.push({
      source: CONDUCTOR_2_ID,
      target: "agent-prompt-engineer",
      kind: "loopback",
      label: "rejected · max 3",
    });
  }
  if (present.has("agent-conductor")) {
    edges.push({
      source: CONDUCTOR_2_ID,
      target: "agent-conductor",
      kind: "escalation",
      label: ">3 loops · escalate",
    });
  }

  // Documenter → Versioner
  if (present.has("agent-documenter") && present.has("agent-versioner")) {
    edges.push({
      source: "agent-documenter",
      target: "agent-versioner",
      kind: "sequence",
      label: "vault updated",
    });
  }

  return {
    nodes,
    edges,
    pipelines: PIPELINES,
    phases: PHASES,
  };
}

function buildGenericChoreography(projectAgents: AgentDefinition[]): Choreography {
  const nodes: ChoreographyNode[] = projectAgents.map((a, i) => {
    const meta = ROLE_DEFAULTS[a.name] ?? { phase: "dev" as const, role: "specialist" as const, fixed: false };
    return {
      id: a.name,
      agentId: a.name,
      name: a.name.replace(/^agent-/, ""),
      phase: meta.phase,
      role: meta.role,
      fixed: meta.fixed,
      pipelines: [],
      description: a.description,
      position: { x: 60 + (i % 6) * 220, y: 80 + Math.floor(i / 6) * 100 },
    };
  });
  return { nodes, edges: [], pipelines: PIPELINES, phases: PHASES };
}
