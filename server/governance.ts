import fs from "node:fs";
import path from "node:path";
import type { BudgetMap, ProjectBudget, TagMap } from "@shared/types.ts";
import { WATCH_DIR } from "./paths.ts";

const BUDGETS_FILE = path.join(WATCH_DIR, "budgets.json");
const TAGS_FILE = path.join(WATCH_DIR, "tags.json");

function ensureWatchDir(): void {
  try {
    fs.mkdirSync(WATCH_DIR, { recursive: true });
  } catch {
    // best effort
  }
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(txt) as unknown;
    if (parsed && typeof parsed === "object") return parsed as T;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  ensureWatchDir();
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function mtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

interface BudgetCache {
  mtime: number;
  data: BudgetMap;
}
let budgetCache: BudgetCache | null = null;

interface TagCache {
  mtime: number;
  data: TagMap;
}
let tagCache: TagCache | null = null;

export function readBudgets(): BudgetMap {
  const m = mtime(BUDGETS_FILE);
  if (budgetCache && budgetCache.mtime === m) return budgetCache.data;
  const data = readJsonSafe<BudgetMap>(BUDGETS_FILE, {});
  const sanitized: BudgetMap = {};
  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== "object") continue;
    const monthly = Number((value as ProjectBudget).monthly);
    if (!Number.isFinite(monthly) || monthly < 0) continue;
    const alertThresholdRaw = Number((value as ProjectBudget).alertThreshold);
    const alertThreshold =
      Number.isFinite(alertThresholdRaw) && alertThresholdRaw > 0 && alertThresholdRaw < 1
        ? alertThresholdRaw
        : 0.8;
    const rolloverDayRaw = Number((value as ProjectBudget).rolloverDay);
    const rolloverDay =
      Number.isFinite(rolloverDayRaw) && rolloverDayRaw >= 1 && rolloverDayRaw <= 28
        ? Math.floor(rolloverDayRaw)
        : 1;
    sanitized[key] = { monthly, alertThreshold, rolloverDay };
  }
  budgetCache = { mtime: m, data: sanitized };
  return sanitized;
}

export function writeBudget(projectKey: string, budget: ProjectBudget | null): BudgetMap {
  const all = { ...readBudgets() };
  if (budget === null) {
    delete all[projectKey];
  } else {
    const monthly = Number(budget.monthly);
    if (!Number.isFinite(monthly) || monthly < 0) {
      throw new Error("budget.monthly must be a non-negative number");
    }
    const alertThreshold = Number(budget.alertThreshold);
    if (!Number.isFinite(alertThreshold) || alertThreshold <= 0 || alertThreshold >= 1) {
      throw new Error("budget.alertThreshold must be between 0 and 1 exclusive");
    }
    const rolloverDay = Number(budget.rolloverDay ?? 1);
    if (!Number.isFinite(rolloverDay) || rolloverDay < 1 || rolloverDay > 28) {
      throw new Error("budget.rolloverDay must be an integer between 1 and 28");
    }
    all[projectKey] = { monthly, alertThreshold, rolloverDay: Math.floor(rolloverDay) };
  }
  writeJsonAtomic(BUDGETS_FILE, all);
  budgetCache = null;
  return readBudgets();
}

export function readTags(): TagMap {
  const m = mtime(TAGS_FILE);
  if (tagCache && tagCache.mtime === m) return tagCache.data;
  const data = readJsonSafe<TagMap>(TAGS_FILE, {});
  const sanitized: TagMap = {};
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    const tags = value
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter((t) => t.length > 0 && t.length <= 40);
    if (tags.length === 0) continue;
    sanitized[key] = Array.from(new Set(tags)).sort();
  }
  tagCache = { mtime: m, data: sanitized };
  return sanitized;
}

export function writeTags(projectKey: string, tags: string[]): TagMap {
  const all = { ...readTags() };
  const cleaned = Array.from(
    new Set(
      (tags ?? [])
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0 && t.length <= 40),
    ),
  ).sort();
  if (cleaned.length === 0) {
    delete all[projectKey];
  } else {
    all[projectKey] = cleaned;
  }
  writeJsonAtomic(TAGS_FILE, all);
  tagCache = null;
  return readTags();
}

export function listAllTags(): string[] {
  const tagSet = new Set<string>();
  for (const tags of Object.values(readTags())) {
    for (const t of tags) tagSet.add(t);
  }
  return Array.from(tagSet).sort();
}

export function rolloverWindowStart(rolloverDay: number, now: Date = new Date()): number {
  const day = Math.max(1, Math.min(28, Math.floor(rolloverDay)));
  const start = new Date(now);
  start.setDate(day);
  start.setHours(0, 0, 0, 0);
  if (start.getTime() > now.getTime()) {
    start.setMonth(start.getMonth() - 1);
  }
  return start.getTime();
}
