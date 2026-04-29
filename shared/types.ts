export interface TokenUsage {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
}

export type AgentStatus = "idle" | "running" | "done" | "error";

export interface AgentRun {
  id: string;
  toolUseId: string;
  parentToolUseId: string | null;
  kind: AgentKind | "main";
  agentType: string;
  description: string;
  status: AgentStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  tokens: TokenUsage;
  cost: CostBreakdown;
  parallelGroupId: string | null;
  turnIndex: number;
  prompt?: string;
  outputPreview?: string;
  errorMessage?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  parallel: boolean;
}

export interface FlowGraph {
  rootId: string;
  nodes: AgentRun[];
  edges: FlowEdge[];
}

export interface SessionSnapshot {
  sessionId: string;
  cwd: string;
  projectKey: string;
  model: string;
  version: string;
  gitBranch?: string;
  startedAt: number;
  lastActivityAt: number;
  turnCount: number;
  tokens: TokenUsage;
  cost: CostBreakdown;
  cacheHitRate: number;
  contextUsage: {
    used: number;
    limit: number;
    pct: number;
  };
  status: "active" | "idle" | "ended";
}

export interface ProjectSummary {
  projectKey: string;
  cwd: string;
  displayName: string;
  sessionCount: number;
  activeSessionId: string | null;
  totalTokens: number;
  totalCost: number;
  lastActivityAt: number;
  isLive: boolean;
}

export type AgentKind = "agent" | "skill";

export interface LastInvocation {
  sessionId: string;
  toolUseId: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  prompt: string;
  outputPreview?: string;
  model: string;
  status: "running" | "done" | "error";
}

export interface AgentHistoryEntry {
  toolUseId: string;
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  status: "running" | "done" | "error";
  model: string;
  promptPreview: string;
}

export interface AgentHistory {
  totalInvocations: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
  totalDurationMs: number;
  entries: AgentHistoryEntry[];
  daily: { day: string; count: number; avgMs: number; errors: number }[];
}

export interface AgentDetail {
  name: string;
  kind: AgentKind;
  source: "global" | "project" | "plugin";
  pluginName?: string;
  filePath: string;
  isInsideObsidian: boolean;
  obsidianVault?: string;
  obsidianRelPath?: string;
  frontmatter: Record<string, string>;
  body: string;
  rawContent: string;
  preferredModel: string | null;
  lastInvocation: LastInvocation | null;
  history: AgentHistory;
}

export interface AgentDefinition {
  name: string;
  kind: AgentKind;
  source: "global" | "project" | "plugin";
  pluginName?: string;
  description?: string;
  filePath: string;
}

export type EventKind =
  | "tool_call"
  | "tool_result"
  | "agent_spawn"
  | "agent_done"
  | "agent_error"
  | "user_message"
  | "assistant_message"
  | "session_start"
  | "session_end";

export interface TimelineEvent {
  id: string;
  kind: EventKind;
  timestamp: number;
  sessionId: string;
  label: string;
  detail?: string;
  agentRunId?: string;
  toolName?: string;
}

export interface UserTotals {
  todayTokens: number;
  todayCost: number;
  allTimeTokens: number;
  allTimeCost: number;
  sessionsToday: number;
}

export interface UsageByModel {
  opus: number;
  sonnet: number;
  haiku: number;
  other: number;
}

export interface UsageWindow {
  windowMs: number;
  startedAt: number;
  endsAt: number;
  resetInMs: number;
  totalTokens: number;
  totalCost: number;
  messageCount: number;
  byModel: UsageByModel;
  unit: "messages" | "tokens";
  limit: number;
  used: number;
  pct: number;
  // Projection: burn rate in last 30 minutes extrapolated to limit
  burnRatePerHour: number;
  projectedLimitHitMs: number | null;
}

export interface UsageDashboard {
  plan: string;
  fiveHour: UsageWindow;
  weeklyAll: UsageWindow;
  weeklyOpus: UsageWindow;
}

export type ChoreographyEdgeKind =
  | "dispatch"
  | "sequence"
  | "parallel"
  | "gate-pass"
  | "loopback"
  | "escalation"
  | "veto";

export interface ChoreographyEdge {
  source: string;
  target: string;
  kind: ChoreographyEdgeKind;
  pipeline?: string;
  label?: string;
}

export type ChoreographyPhase =
  | "entry"
  | "dispatcher"
  | "dev"
  | "gate"
  | "merge"
  | "docs"
  | "exit";

export type ChoreographyRole =
  | "orchestrator"
  | "dispatcher"
  | "specialist"
  | "gate"
  | "support"
  | "tail";

export interface ChoreographyNode {
  id: string;
  agentId: string;
  name: string;
  phase: ChoreographyPhase;
  role: ChoreographyRole;
  cluster?: string;
  fixed: boolean;
  parallelWith?: string[];
  pipelines: string[];
  description?: string;
  position?: { x: number; y: number };
}

export interface Choreography {
  nodes: ChoreographyNode[];
  edges: ChoreographyEdge[];
  pipelines: { id: string; label: string; description?: string }[];
  phases: { id: ChoreographyPhase; label: string }[];
}

export type MemoryEntryKind = "user" | "feedback" | "project" | "reference" | "claude-md" | "obsidian";

export interface MemoryEntry {
  id: string;
  kind: MemoryEntryKind;
  name: string;
  description?: string;
  filePath: string;
  preview?: string;
  modifiedAt: number;
  size: number;
}

export interface MemoryBank {
  entries: MemoryEntry[];
  obsidianSummary?: {
    rootPath: string;
    folders: { name: string; fileCount: number }[];
    totalFiles: number;
  };
  totalEntries: number;
}

export interface DashboardSnapshot {
  projects: ProjectSummary[];
  activeProjectKey: string | null;
  activeSession: SessionSnapshot | null;
  flow: FlowGraph | null;
  agents: AgentDefinition[];
  agentsByProject: Record<string, AgentDefinition[]>;
  choreographyByProject: Record<string, Choreography>;
  memoryByProject: Record<string, MemoryBank>;
  recentEvents: TimelineEvent[];
  totals: UserTotals;
  usage: UsageDashboard;
}

export interface EditorSource {
  id: string;
  name: string;
  kind: "agent" | "skill" | "obsidian";
  source: "project" | "global" | "plugin" | "obsidian";
  pluginName?: string;
  projectKey?: string;
  projectCwd?: string;
  filePath: string;
  readonly: boolean;
  description?: string;
  mtimeMs: number;
}

export interface EditorFile {
  source: EditorSource;
  content: string;
  frontmatter: Record<string, string>;
  body: string;
}

export type ServerEvent =
  | { type: "snapshot"; payload: DashboardSnapshot }
  | { type: "session_update"; payload: SessionSnapshot }
  | { type: "flow_update"; payload: FlowGraph }
  | { type: "event"; payload: TimelineEvent }
  | { type: "totals_update"; payload: UserTotals }
  | { type: "projects_update"; payload: ProjectSummary[] }
  | { type: "heartbeat"; payload: { ts: number } };
