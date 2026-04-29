import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { CLAUDE_DIR, PLUGINS_DIR, PROJECTS_DIR } from "./paths.ts";
import { scanAgents } from "./agents.ts";
import type { AgentDefinition, AgentDetail, AgentHistory, AgentHistoryEntry, LastInvocation } from "@shared/types.ts";

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;

function parseFrontmatterBlock(text: string): { fm: Record<string, string>; body: string } {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { fm: {}, body: text };
  const fm: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) fm[key] = value;
  }
  const body = text.slice(match[0].length);
  return { fm, body };
}

export function serializeFrontmatter(
  fm: Record<string, string>,
  body: string,
): string {
  const orderedKeys: string[] = [];
  for (const key of ["name", "description", "model", "color", "trigger"]) {
    if (key in fm) orderedKeys.push(key);
  }
  for (const key of Object.keys(fm)) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }
  const lines = ["---"];
  for (const key of orderedKeys) {
    const v = fm[key];
    if (v == null) continue;
    const needsQuote = /[:#&*?,\[\]\{\}]/.test(v);
    lines.push(`${key}: ${needsQuote ? JSON.stringify(v) : v}`);
  }
  lines.push("---");
  return lines.join("\n") + (body.startsWith("\n") ? body : "\n" + body);
}

function findObsidianVault(filePath: string): { rootPath: string; vault: string; rel: string } | null {
  let dir = path.dirname(filePath);
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    const obsidianDir = path.join(dir, ".obsidian");
    if (fs.existsSync(obsidianDir) && fs.statSync(obsidianDir).isDirectory()) {
      return {
        rootPath: dir,
        vault: path.basename(dir),
        rel: path.relative(dir, filePath).replace(/\\/g, "/"),
      };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

interface RawLine {
  type?: string;
  parentUuid?: string | null;
  uuid?: string;
  isSidechain?: boolean;
  sessionId?: string;
  timestamp?: string;
  message?: {
    model?: string;
    role?: string;
    content?: unknown;
  };
}

interface ScannedInvocation {
  toolUseId: string;
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  status: "running" | "done" | "error";
  model: string;
  promptPreview: string;
  fullPrompt: string;
  outputPreview: string | null;
}

async function scanInvocations(
  projectKey: string,
  agentName: string,
  recentSessions = 25,
): Promise<ScannedInvocation[]> {
  if (!projectKey) return [];
  const projDir = path.join(PROJECTS_DIR, projectKey);
  if (!fs.existsSync(projDir)) return [];

  const files = fs
    .readdirSync(projDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const full = path.join(projDir, f);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {}
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, recentSessions);

  const invocations: ScannedInvocation[] = [];

  for (const { full } of files) {
    const stream = fs.createReadStream(full, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const calls = new Map<string, { ts: number; prompt: string; model: string }>();
    const results = new Map<string, { ts: number; preview: string; isError: boolean }>();
    let lastActivityAt = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      let raw: RawLine;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = raw.timestamp ? Date.parse(raw.timestamp) : Date.now();
      if (ts) lastActivityAt = Math.max(lastActivityAt, ts);

      if (raw.message?.role === "assistant" && Array.isArray(raw.message.content)) {
        for (const block of raw.message.content as Array<{
          type?: string;
          name?: string;
          id?: string;
          input?: { skill?: string; subagent_type?: string; description?: string; prompt?: string; args?: string };
        }>) {
          if (block.type !== "tool_use" || !block.id) continue;
          const isMatch =
            (block.name === "Skill" && block.input?.skill === agentName) ||
            ((block.name === "Task" || block.name === "Agent") && block.input?.subagent_type === agentName);
          if (!isMatch) continue;
          const prompt =
            block.input?.prompt ?? block.input?.args ?? block.input?.description ?? "";
          calls.set(block.id, {
            ts,
            prompt: typeof prompt === "string" ? prompt : JSON.stringify(prompt),
            model: raw.message.model ?? "unknown",
          });
        }
      }

      if (
        raw.message?.role === "user" &&
        Array.isArray(raw.message.content)
      ) {
        for (const block of raw.message.content as Array<{
          type?: string;
          tool_use_id?: string;
          content?: unknown;
          is_error?: boolean;
        }>) {
          if (block.type !== "tool_result" || !block.tool_use_id) continue;
          if (!calls.has(block.tool_use_id)) continue;
          const text =
            typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
              ? block.content
                  .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text ?? ""))
                  .join(" ")
              : JSON.stringify(block.content ?? "");
          results.set(block.tool_use_id, { ts, preview: text.slice(0, 1200), isError: !!block.is_error });
        }
      }
    }

    for (const [toolUseId, call] of calls) {
      const result = results.get(toolUseId);
      invocations.push({
        sessionId: path.basename(full, ".jsonl"),
        toolUseId,
        startedAt: call.ts,
        endedAt: result?.ts ?? null,
        durationMs: result ? result.ts - call.ts : null,
        promptPreview: call.prompt.slice(0, 200).replace(/\s+/g, " "),
        fullPrompt: call.prompt.slice(0, 4000),
        outputPreview: result?.preview ?? null,
        model: call.model,
        status: result
          ? result.isError
            ? "error"
            : "done"
          : lastActivityAt > Date.now() - 30_000
          ? "running"
          : "done",
      });
    }
  }

  invocations.sort((a, b) => b.startedAt - a.startedAt);
  return invocations;
}

function buildHistory(invocations: ScannedInvocation[]): AgentHistory {
  const completed = invocations.filter((i) => i.durationMs != null);
  const successCount = invocations.filter((i) => i.status === "done").length;
  const errorCount = invocations.filter((i) => i.status === "error").length;
  const durations = completed.map((i) => i.durationMs!).sort((a, b) => a - b);
  const total = durations.reduce((s, x) => s + x, 0);
  const avg = durations.length ? total / durations.length : 0;
  const p95 = durations.length ? durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1]! : 0;

  // Daily aggregation last 14 days
  const dayCounts = new Map<string, { count: number; sumMs: number; errors: number }>();
  const horizon = Date.now() - 14 * 24 * 3600 * 1000;
  for (const inv of invocations) {
    if (inv.startedAt < horizon) continue;
    const d = new Date(inv.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cur = dayCounts.get(key) ?? { count: 0, sumMs: 0, errors: 0 };
    cur.count += 1;
    if (inv.durationMs != null) cur.sumMs += inv.durationMs;
    if (inv.status === "error") cur.errors += 1;
    dayCounts.set(key, cur);
  }
  const daily: AgentHistory["daily"] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cur = dayCounts.get(key) ?? { count: 0, sumMs: 0, errors: 0 };
    daily.push({ day: key, count: cur.count, avgMs: cur.count ? cur.sumMs / cur.count : 0, errors: cur.errors });
  }

  const entries: AgentHistoryEntry[] = invocations.slice(0, 60).map((i) => ({
    toolUseId: i.toolUseId,
    sessionId: i.sessionId,
    startedAt: i.startedAt,
    endedAt: i.endedAt,
    durationMs: i.durationMs,
    status: i.status,
    model: i.model,
    promptPreview: i.promptPreview,
  }));

  return {
    totalInvocations: invocations.length,
    successCount,
    errorCount,
    avgDurationMs: avg,
    p95DurationMs: p95,
    totalDurationMs: total,
    entries,
    daily,
  };
}

export async function buildAgentDetail(
  agentName: string,
  projectKey: string | null,
  projectCwd: string | null,
): Promise<AgentDetail | null> {
  const list: AgentDefinition[] = scanAgents(projectCwd ?? undefined);
  const def = list.find((a) => a.name === agentName);
  if (!def) return null;

  let raw = "";
  try {
    raw = fs.readFileSync(def.filePath, "utf8");
  } catch {
    return null;
  }

  const { fm, body } = parseFrontmatterBlock(raw);
  const obsidian = findObsidianVault(def.filePath);

  const invocations = projectKey ? await scanInvocations(projectKey, agentName) : [];
  const lastInvocation: LastInvocation | null = invocations[0]
    ? {
        sessionId: invocations[0].sessionId,
        toolUseId: invocations[0].toolUseId,
        startedAt: invocations[0].startedAt,
        endedAt: invocations[0].endedAt,
        durationMs: invocations[0].durationMs,
        prompt: invocations[0].fullPrompt,
        outputPreview: invocations[0].outputPreview ?? undefined,
        model: invocations[0].model,
        status: invocations[0].status,
      }
    : null;
  const history = buildHistory(invocations);

  return {
    name: def.name,
    kind: def.kind,
    source: def.source,
    pluginName: def.pluginName,
    filePath: def.filePath,
    isInsideObsidian: !!obsidian,
    obsidianVault: obsidian?.vault,
    obsidianRelPath: obsidian?.rel,
    frontmatter: fm,
    body,
    rawContent: raw,
    preferredModel: fm.model ?? null,
    lastInvocation,
    history,
  };
}

export function writeAgentDetail(
  filePath: string,
  patch: { content?: string; model?: string | null },
): string {
  const allowedRoots = [
    path.join(CLAUDE_DIR, "agents"),
    path.join(CLAUDE_DIR, "skills"),
    PLUGINS_DIR,
  ];
  const normalized = path.resolve(filePath);
  // Allow project-local .claude/agents and .claude/skills (cwd-derived)
  // Only block writes to plugin cache for safety.
  if (normalized.startsWith(path.join(PLUGINS_DIR, "cache"))) {
    throw new Error("Refusing to write inside plugin cache");
  }
  void allowedRoots;

  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  let raw = fs.readFileSync(filePath, "utf8");

  if (patch.content != null) {
    raw = patch.content;
  } else if (patch.model !== undefined) {
    const { fm, body } = parseFrontmatterBlock(raw);
    if (patch.model === null || patch.model === "") delete fm.model;
    else fm.model = patch.model;
    raw = serializeFrontmatter(fm, body);
  }

  fs.writeFileSync(filePath, raw, "utf8");
  return raw;
}
