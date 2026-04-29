import fs from "node:fs";
import readline from "node:readline";
import {
  addCost,
  addUsage,
  cacheHitRate,
  computeCost,
  contextLimitFor,
  emptyCost,
  emptyUsage,
  totalTokens,
} from "@shared/pricing.ts";
import type {
  AgentRun,
  CostBreakdown,
  FlowEdge,
  FlowGraph,
  SessionSnapshot,
  TimelineEvent,
  TokenUsage,
} from "@shared/types.ts";

interface RawLine {
  type?: string;
  parentUuid?: string | null;
  uuid?: string;
  isSidechain?: boolean;
  sessionId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  timestamp?: string;
  message?: {
    id?: string;
    role?: "user" | "assistant";
    model?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  attachment?: {
    type?: string;
    hookEvent?: string;
    hookName?: string;
    toolUseID?: string;
  };
  toolUseResult?: unknown;
  permissionMode?: string;
}

function asTime(iso: string | undefined): number {
  return iso ? Date.parse(iso) : Date.now();
}

function readUsage(raw: RawLine): TokenUsage {
  const u = raw.message?.usage ?? {};
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheCreate: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
  };
}

interface TurnUsage {
  ts: number;
  model: string;
  usage: TokenUsage;
}

interface ParsedSession {
  snapshot: SessionSnapshot;
  flow: FlowGraph;
  events: TimelineEvent[];
  turns: TurnUsage[];
}

interface ToolCall {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  parentUuid: string | null;
  spawnedAt: number;
  turnIndex: number;
  parallelGroupId: string | null;
}

interface ToolResult {
  toolUseId: string;
  isError: boolean;
  content: string;
  endedAt: number;
}

const MAX_PREVIEW = 220;

function previewOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.slice(0, MAX_PREVIEW);
  if (Array.isArray(value)) {
    const text = value
      .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
      .filter(Boolean)
      .join(" ");
    return text.slice(0, MAX_PREVIEW);
  }
  if (typeof value === "object") {
    return JSON.stringify(value).slice(0, MAX_PREVIEW);
  }
  return String(value).slice(0, MAX_PREVIEW);
}

export async function parseJsonlFile(filePath: string): Promise<ParsedSession | null> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let sessionId = "";
  let cwd = "";
  let model = "";
  let version = "";
  let gitBranch: string | undefined;
  let startedAt = 0;
  let lastActivityAt = 0;
  let turnIndex = 0;

  let totalUsage = emptyUsage();
  let totalCost: CostBreakdown = emptyCost();
  const turns: TurnUsage[] = [];

  const toolCalls = new Map<string, ToolCall>();
  const toolResults = new Map<string, ToolResult>();
  const agentRuns = new Map<string, AgentRun>();
  const events: TimelineEvent[] = [];
  const turnTaskCalls = new Map<number, ToolCall[]>();
  const parentByUuid = new Map<string, string | null>();
  const spawnerByLineUuid = new Map<string, string>(); // lineUuid -> taskToolUseId
  const eventLineUuid = new Map<string, string>(); // event.id -> lineUuid

  let lineNo = 0;
  for await (const line of rl) {
    lineNo += 1;
    if (!line.trim()) continue;
    let raw: RawLine;
    try {
      raw = JSON.parse(line) as RawLine;
    } catch {
      continue;
    }

    const ts = asTime(raw.timestamp);
    if (raw.sessionId && !sessionId) sessionId = raw.sessionId;
    if (raw.cwd && !cwd) cwd = raw.cwd;
    if (raw.version && !version) version = raw.version;
    if (raw.gitBranch && !gitBranch) gitBranch = raw.gitBranch;
    if (ts && !startedAt) startedAt = ts;
    if (ts) lastActivityAt = Math.max(lastActivityAt, ts);

    const lineUuid = raw.uuid;
    if (lineUuid) parentByUuid.set(lineUuid, raw.parentUuid ?? null);

    if (raw.type === "user" && !raw.isSidechain) {
      const content = (raw.message as { content?: unknown } | undefined)?.content;
      const blocks = Array.isArray(content) ? content : null;
      const hasToolResult = blocks?.some(
        (b) => (b as { type?: string }).type === "tool_result",
      );

      if (hasToolResult && blocks) {
        for (const block of blocks) {
          const b = block as {
            type?: string;
            tool_use_id?: string;
            content?: unknown;
            is_error?: boolean;
          };
          if (b.type === "tool_result" && b.tool_use_id) {
            const text = previewOf(b.content);
            toolResults.set(b.tool_use_id, {
              toolUseId: b.tool_use_id,
              isError: !!b.is_error,
              content: text,
              endedAt: ts,
            });
            const evId = `${sessionId}:result:${b.tool_use_id}:${lineNo}`;
            events.push({
              id: evId,
              kind: "tool_result",
              timestamp: ts,
              sessionId,
              label: `result`,
              detail: text,
            });
            if (lineUuid) eventLineUuid.set(evId, lineUuid);
          }
        }
        continue;
      }

      turnIndex += 1;
      events.push({
        id: `${sessionId}:user:${lineNo}`,
        kind: "user_message",
        timestamp: ts,
        sessionId,
        label: "User message",
        detail: previewOf(content),
      });
      continue;
    }

    if (raw.message?.role === "assistant") {
      const msgModel = raw.message.model;
      if (msgModel) model = msgModel;
      const usage = readUsage(raw);
      totalUsage = addUsage(totalUsage, usage);
      totalCost = addCost(totalCost, computeCost(usage, msgModel ?? model));
      if (usage.input || usage.output || usage.cacheCreate || usage.cacheRead) {
        turns.push({ ts, model: msgModel ?? model ?? "unknown", usage });
      }

      const content = raw.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as {
            type?: string;
            id?: string;
            name?: string;
            input?: Record<string, unknown>;
            text?: string;
          };
          if (b.type === "tool_use" && b.id && b.name) {
            const call: ToolCall = {
              toolUseId: b.id,
              name: b.name,
              input: b.input ?? {},
              parentUuid: raw.parentUuid ?? null,
              spawnedAt: ts,
              turnIndex,
              parallelGroupId: null,
            };
            toolCalls.set(b.id, call);
            const isSpawner = b.name === "Task" || b.name === "Agent" || b.name === "Skill";
            if (isSpawner) {
              const list = turnTaskCalls.get(turnIndex) ?? [];
              list.push(call);
              turnTaskCalls.set(turnIndex, list);
              if (lineUuid) spawnerByLineUuid.set(lineUuid, b.id);
            }
            const evId = `${sessionId}:tool:${b.id}`;
            events.push({
              id: evId,
              kind: "tool_call",
              timestamp: ts,
              sessionId,
              label: `tool: ${b.name}`,
              detail: previewOf(b.input),
              toolName: b.name,
              agentRunId: isSpawner ? b.id : undefined,
            });
            if (lineUuid) eventLineUuid.set(evId, lineUuid);
          } else if (b.type === "text" && b.text) {
            const evId = `${sessionId}:asst:${lineNo}:${b.id ?? "text"}`;
            events.push({
              id: evId,
              kind: "assistant_message",
              timestamp: ts,
              sessionId,
              label: "Assistant",
              detail: previewOf(b.text),
            });
            if (lineUuid) eventLineUuid.set(evId, lineUuid);
          }
        }
      }
      continue;
    }

  }

  if (!sessionId) return null;

  // Attribute events to subagent runs by walking parentUuid chain.
  const ATTRIBUTION_DEPTH = 80;
  function findOwningSpawner(startUuid: string): string | null {
    let cur: string | null | undefined = startUuid;
    let hops = 0;
    const seen = new Set<string>();
    while (cur && hops < ATTRIBUTION_DEPTH) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      const spawner = spawnerByLineUuid.get(cur);
      if (spawner) return spawner;
      cur = parentByUuid.get(cur) ?? null;
      hops += 1;
    }
    return null;
  }

  const eventsByAgent = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const lu = eventLineUuid.get(ev.id);
    if (!lu) continue;
    const owner = findOwningSpawner(lu);
    if (!owner) continue;
    if (ev.agentRunId === owner) continue; // spawn event itself; already tagged
    if (!ev.agentRunId) ev.agentRunId = owner;
    const list = eventsByAgent.get(owner) ?? [];
    list.push(ev);
    eventsByAgent.set(owner, list);
  }

  // Mark parallel groups
  for (const [, calls] of turnTaskCalls) {
    if (calls.length >= 2) {
      const groupId = `pg:${calls[0]!.toolUseId}`;
      for (const c of calls) c.parallelGroupId = groupId;
    }
  }

  const rootId = `root:${sessionId}`;
  const rootRun: AgentRun = {
    id: rootId,
    toolUseId: rootId,
    parentToolUseId: null,
    kind: "main",
    agentType: "main",
    description: model || "session",
    status: lastActivityAt > Date.now() - 30_000 ? "running" : "done",
    startedAt: startedAt || lastActivityAt,
    endedAt: lastActivityAt,
    durationMs: lastActivityAt - startedAt,
    tokens: totalUsage,
    cost: totalCost,
    parallelGroupId: null,
    turnIndex: 0,
    prompt: undefined,
  };
  agentRuns.set(rootId, rootRun);

  const edges: FlowEdge[] = [];

  for (const call of toolCalls.values()) {
    if (call.name !== "Task" && call.name !== "Agent" && call.name !== "Skill") continue;
    const result = toolResults.get(call.toolUseId);
    const input = call.input as {
      subagent_type?: string;
      description?: string;
      prompt?: string;
      skill?: string;
      args?: string;
    };
    const isSkill = call.name === "Skill";
    const agentType = isSkill
      ? input.skill ?? "skill"
      : input.subagent_type ?? "general-purpose";
    const description = isSkill
      ? input.args ?? input.skill ?? "skill"
      : input.description ?? "agent";
    const run: AgentRun = {
      id: call.toolUseId,
      toolUseId: call.toolUseId,
      parentToolUseId: rootId,
      kind: isSkill ? "skill" : "agent",
      agentType,
      description,
      status: result
        ? result.isError
          ? "error"
          : "done"
        : lastActivityAt > Date.now() - 30_000
        ? "running"
        : "done",
      startedAt: call.spawnedAt,
      endedAt: result?.endedAt ?? lastActivityAt,
      durationMs: result ? result.endedAt - call.spawnedAt : null,
      tokens: emptyUsage(),
      cost: emptyCost(),
      parallelGroupId: call.parallelGroupId,
      turnIndex: call.turnIndex,
      prompt: typeof input.prompt === "string"
        ? input.prompt.slice(0, 600)
        : typeof input.args === "string"
        ? input.args.slice(0, 600)
        : undefined,
      outputPreview: result?.content,
      errorMessage: result?.isError ? result.content : undefined,
      recentEvents: (eventsByAgent.get(call.toolUseId) ?? [])
        .slice(-30)
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          timestamp: e.timestamp,
          sessionId: e.sessionId,
          label: e.label,
          detail: e.detail,
          toolName: e.toolName,
          agentRunId: e.agentRunId,
        })),
    };
    agentRuns.set(run.id, run);
    edges.push({
      id: `e:${rootId}->${run.id}`,
      source: rootId,
      target: run.id,
      parallel: !!call.parallelGroupId,
    });
  }

  const limit = contextLimitFor(model);
  const ctxUsed = totalUsage.input + totalUsage.cacheCreate + totalUsage.cacheRead;
  const snapshot: SessionSnapshot = {
    sessionId,
    cwd,
    projectKey: deriveProjectKey(filePath),
    model: model || "unknown",
    version,
    gitBranch,
    startedAt,
    lastActivityAt,
    turnCount: turnIndex,
    tokens: totalUsage,
    cost: totalCost,
    cacheHitRate: cacheHitRate(totalUsage),
    contextUsage: {
      used: ctxUsed,
      limit,
      pct: limit ? ctxUsed / limit : 0,
    },
    status: lastActivityAt > Date.now() - 60_000 ? "active" : "idle",
  };

  void totalTokens;

  return {
    snapshot,
    flow: {
      rootId,
      nodes: Array.from(agentRuns.values()),
      edges,
    },
    events: events.slice(-200),
    turns,
  };
}

function deriveProjectKey(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const idx = parts.lastIndexOf("projects");
  return idx >= 0 && parts[idx + 1] ? parts[idx + 1]! : "";
}
