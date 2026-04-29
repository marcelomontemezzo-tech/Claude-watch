import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import chokidar, { type FSWatcher } from "chokidar";
import {
  addCost,
  addUsage,
  cacheHitRate,
  emptyCost,
  emptyUsage,
} from "@shared/pricing.ts";
import type {
  DashboardSnapshot,
  ProjectSummary,
  SessionSnapshot,
  TimelineEvent,
  UsageByModel,
  UsageDashboard,
  UsageWindow,
  UserTotals,
} from "@shared/types.ts";
import { billableTokens, computeCost } from "@shared/pricing.ts";
import { PROJECTS_DIR, projectDisplayName } from "./paths.ts";
import { parseJsonlFile } from "./jsonl-parser.ts";
import { scanAgents } from "./agents.ts";
import { buildChoreography } from "./choreography.ts";
import { buildMemoryBank } from "./memory.ts";
import type { Choreography, MemoryBank } from "@shared/types.ts";

interface SessionRecord {
  sessionId: string;
  projectKey: string;
  filePath: string;
  mtime: number;
  size: number;
  parsed?: Awaited<ReturnType<typeof parseJsonlFile>>;
}

const RECENT_WINDOW_MS = 90_000;

export class WatcherStore extends EventEmitter {
  private sessions = new Map<string, SessionRecord>();
  private fsWatcher: FSWatcher | null = null;
  private parsing = new Set<string>();
  private lastSnapshotAt = 0;
  private debounceTimer: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (!fs.existsSync(PROJECTS_DIR)) {
      throw new Error(`Claude projects dir not found: ${PROJECTS_DIR}`);
    }
    await this.bootstrap();
    this.fsWatcher = chokidar.watch(PROJECTS_DIR, {
      ignoreInitial: true,
      depth: 4,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
      ignored: (p: string) => p.includes("file-history-snapshot"),
    });
    this.fsWatcher.on("add", (p: string) => this.handleFile(p));
    this.fsWatcher.on("change", (p: string) => this.handleFile(p));
  }

  async stop(): Promise<void> {
    await this.fsWatcher?.close();
    this.fsWatcher = null;
  }

  private async bootstrap(): Promise<void> {
    const projectDirs = safeReadDir(PROJECTS_DIR).filter((d) =>
      fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory(),
    );
    const tasks: Promise<void>[] = [];
    for (const projectKey of projectDirs) {
      const dir = path.join(PROJECTS_DIR, projectKey);
      const files = safeReadDir(dir).filter((f) => f.endsWith(".jsonl"));
      for (const file of files) {
        const filePath = path.join(dir, file);
        tasks.push(this.handleFile(filePath, true));
      }
    }
    await Promise.all(tasks);
    this.scheduleSnapshot(0);
  }

  private async handleFile(filePath: string, initial = false): Promise<void> {
    if (!filePath.endsWith(".jsonl")) return;
    if (this.parsing.has(filePath)) return;
    this.parsing.add(filePath);
    try {
      const stat = fs.statSync(filePath);
      const sessionId = path.basename(filePath, ".jsonl");
      const projectKey = path.basename(path.dirname(filePath));
      const existing = this.sessions.get(sessionId);
      if (existing && existing.mtime === stat.mtimeMs && existing.size === stat.size) {
        return;
      }
      const parsed = await parseJsonlFile(filePath);
      this.sessions.set(sessionId, {
        sessionId,
        projectKey,
        filePath,
        mtime: stat.mtimeMs,
        size: stat.size,
        parsed,
      });
      if (!initial) this.scheduleSnapshot();
    } catch (err) {
      console.error("[watcher] parse failed", filePath, err);
    } finally {
      this.parsing.delete(filePath);
    }
  }

  private scheduleSnapshot(delay = 120): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.lastSnapshotAt = Date.now();
      this.emit("snapshot", this.buildSnapshot());
    }, delay);
  }

  buildSnapshot(): DashboardSnapshot {
    const sessions = Array.from(this.sessions.values()).filter((s) => s.parsed);
    const now = Date.now();

    const byProject = new Map<string, SessionRecord[]>();
    for (const s of sessions) {
      const list = byProject.get(s.projectKey) ?? [];
      list.push(s);
      byProject.set(s.projectKey, list);
    }

    const projects: ProjectSummary[] = [];
    for (const [projectKey, list] of byProject) {
      list.sort((a, b) => (b.parsed!.snapshot.lastActivityAt) - (a.parsed!.snapshot.lastActivityAt));
      let tokens = 0;
      let cost = 0;
      let activeSessionId: string | null = null;
      let lastActivityAt = 0;
      for (const r of list) {
        const snap = r.parsed!.snapshot;
        tokens += snap.tokens.input + snap.tokens.output + snap.tokens.cacheCreate + snap.tokens.cacheRead;
        cost += snap.cost.total;
        if (snap.lastActivityAt > lastActivityAt) {
          lastActivityAt = snap.lastActivityAt;
          if (now - snap.lastActivityAt < RECENT_WINDOW_MS) activeSessionId = snap.sessionId;
        }
      }
      projects.push({
        projectKey,
        cwd: list[0]!.parsed!.snapshot.cwd,
        displayName: projectDisplayName(projectKey),
        sessionCount: list.length,
        activeSessionId,
        totalTokens: tokens,
        totalCost: cost,
        lastActivityAt,
        isLive: !!activeSessionId,
      });
    }
    projects.sort((a, b) => Number(b.isLive) - Number(a.isLive) || b.lastActivityAt - a.lastActivityAt);

    const liveProject = projects.find((p) => p.isLive) ?? projects[0] ?? null;
    let activeSessionRecord: SessionRecord | undefined;
    if (liveProject) {
      const list = byProject.get(liveProject.projectKey) ?? [];
      activeSessionRecord = list.find((r) => r.sessionId === liveProject.activeSessionId) ?? list[0];
    }

    const activeSession: SessionSnapshot | null = activeSessionRecord?.parsed?.snapshot ?? null;
    const flow = activeSessionRecord?.parsed?.flow ?? null;
    const events: TimelineEvent[] = activeSessionRecord?.parsed?.events ?? [];

    const totals = computeTotals(sessions);
    const usage = computeUsageDashboard(sessions);

    const agentsByProject: Record<string, ReturnType<typeof scanAgents>> = {};
    const choreographyByProject: Record<string, Choreography> = {};
    const memoryByProject: Record<string, MemoryBank> = {};
    for (const proj of projects) {
      const list = scanAgents(proj.cwd);
      agentsByProject[proj.projectKey] = list;
      const choreo = buildChoreography(list);
      if (choreo) choreographyByProject[proj.projectKey] = choreo;
      memoryByProject[proj.projectKey] = buildMemoryBank(proj.projectKey, proj.cwd);
    }

    void cacheHitRate;

    return {
      projects,
      activeProjectKey: liveProject?.projectKey ?? null,
      activeSession,
      flow,
      agents: liveProject ? agentsByProject[liveProject.projectKey] ?? [] : [],
      agentsByProject,
      choreographyByProject,
      memoryByProject,
      recentEvents: events,
      totals,
      usage,
    };
  }
}

const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function modelFamily(model: string): keyof UsageByModel {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  return "other";
}

function emptyByModel(): UsageByModel {
  return { opus: 0, sonnet: 0, haiku: 0, other: 0 };
}

function envNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PROJECTION_WINDOW_MS = 30 * 60 * 1000;

function buildWindow(
  sessions: SessionRecord[],
  windowMs: number,
  modelFilter: ((m: keyof UsageByModel) => boolean) | null,
  limit: number,
  unit: UsageWindow["unit"],
  now: number,
): UsageWindow {
  const cutoff = now - windowMs;
  const projCutoff = now - PROJECTION_WINDOW_MS;
  const byModel = emptyByModel();
  let totalToks = 0;
  let totalCost = 0;
  let messages = 0;
  let oldestInWindow = now;

  let projUsed = 0;
  let projOldest = now;

  for (const s of sessions) {
    if (!s.parsed) continue;
    for (const t of s.parsed.turns) {
      if (t.ts < cutoff) continue;
      const family = modelFamily(t.model);
      if (modelFilter && !modelFilter(family)) continue;
      const toks = billableTokens(t.usage);
      byModel[family] += toks;
      totalToks += toks;
      totalCost += computeCost(t.usage, t.model).total;
      messages += 1;
      if (t.ts < oldestInWindow) oldestInWindow = t.ts;

      if (t.ts >= projCutoff) {
        projUsed += unit === "messages" ? 1 : toks;
        if (t.ts < projOldest) projOldest = t.ts;
      }
    }
  }

  const endsAt = oldestInWindow + windowMs;
  const resetInMs = Math.max(0, endsAt - now);
  const used = unit === "messages" ? messages : totalToks;
  const pct = limit > 0 ? Math.min(1, used / limit) : 0;

  // Burn rate (units/hour) over the projection window
  const projWindowHours = Math.max(0.001, (now - projOldest) / 3_600_000);
  const burnRatePerHour = projUsed / projWindowHours;
  const remaining = Math.max(0, limit - used);
  let projectedLimitHitMs: number | null = null;
  if (burnRatePerHour > 0 && pct < 1) {
    projectedLimitHitMs = (remaining / burnRatePerHour) * 3_600_000;
  }

  return {
    windowMs,
    startedAt: cutoff,
    endsAt,
    resetInMs,
    totalTokens: totalToks,
    totalCost,
    messageCount: messages,
    byModel,
    unit,
    limit,
    used,
    pct,
    burnRatePerHour,
    projectedLimitHitMs,
  };
}

function computeUsageDashboard(sessions: SessionRecord[]): UsageDashboard {
  const now = Date.now();
  const plan = process.env.CLAUDE_WATCH_PLAN ?? "max20";
  // Claude subscription limits are tracked in MESSAGES (assistant turns), matching Claude UI.
  // Defaults calibrated against observed Claude usage page.
  const planDefaults: Record<string, { fiveH: number; weekly: number; weeklyOpus: number }> = {
    pro: { fiveH: 50, weekly: 280, weeklyOpus: 80 },
    max5: { fiveH: 1500, weekly: 3500, weeklyOpus: 800 },
    max20: { fiveH: 5640, weekly: 11630, weeklyOpus: 3000 },
  };
  const defaults = planDefaults[plan] ?? planDefaults.max20!;
  const fiveHLimit = envNumber("CLAUDE_WATCH_5H_LIMIT_MESSAGES", defaults.fiveH);
  const weeklyLimit = envNumber("CLAUDE_WATCH_WEEKLY_LIMIT_MESSAGES", defaults.weekly);
  const weeklyOpusLimit = envNumber("CLAUDE_WATCH_WEEKLY_OPUS_LIMIT_MESSAGES", defaults.weeklyOpus);

  return {
    plan,
    fiveHour: buildWindow(sessions, FIVE_HOUR_MS, null, fiveHLimit, "messages", now),
    weeklyAll: buildWindow(sessions, WEEK_MS, null, weeklyLimit, "messages", now),
    weeklyOpus: buildWindow(sessions, WEEK_MS, (m) => m === "opus", weeklyOpusLimit, "messages", now),
  };
}

function safeReadDir(p: string): string[] {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function computeTotals(sessions: SessionRecord[]): UserTotals {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = todayStart.getTime();

  let todayTokens = 0;
  let todayCost = 0;
  let allTokens = 0;
  let allCost = 0;
  let sessionsToday = 0;

  for (const s of sessions) {
    if (!s.parsed) continue;
    const snap = s.parsed.snapshot;
    const usage = snap.tokens;
    const t = usage.input + usage.output + usage.cacheCreate + usage.cacheRead;
    allTokens += t;
    allCost += snap.cost.total;
    if (snap.lastActivityAt >= cutoff) {
      todayTokens += t;
      todayCost += snap.cost.total;
      sessionsToday += 1;
    }
  }

  void addCost;
  void addUsage;
  void emptyCost;
  void emptyUsage;

  return {
    todayTokens,
    todayCost,
    allTimeTokens: allTokens,
    allTimeCost: allCost,
    sessionsToday,
  };
}
