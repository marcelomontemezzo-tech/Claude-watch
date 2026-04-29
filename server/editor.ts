import fs from "node:fs";
import path from "node:path";
import type { EditorFile, EditorSource, ProjectSummary } from "@shared/types.ts";
import { CLAUDE_DIR, PLUGINS_CACHE } from "./paths.ts";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: content };
  const out: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) out[key] = value;
  }
  return { frontmatter: out, body: content.slice(match[0].length) };
}

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function safeList(p: string): string[] {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function listSubdirs(p: string): string[] {
  return safeList(p).filter((entry) => safeStat(path.join(p, entry))?.isDirectory());
}

function normalize(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").toLowerCase();
}

function isUnder(child: string, parent: string): boolean {
  const c = normalize(child);
  const par = normalize(parent);
  return c === par || c.startsWith(par + "/");
}

function readMd(filePath: string, kind: EditorSource["kind"]): {
  description?: string;
  name?: string;
} {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const fm = parseFrontmatter(text).frontmatter;
    const fallback =
      kind === "skill" && path.basename(filePath) === "SKILL.md"
        ? path.basename(path.dirname(filePath))
        : path.basename(filePath, ".md");
    return { description: fm.description, name: fm.name ?? fallback };
  } catch {
    return {};
  }
}

function walkAgentsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return safeList(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f));
}

function walkSkillsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of safeList(dir)) {
    const full = path.join(dir, entry);
    const stat = safeStat(full);
    if (!stat) continue;
    if (stat.isDirectory()) {
      const skillFile = path.join(full, "SKILL.md");
      if (fs.existsSync(skillFile)) out.push(skillFile);
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function walkObsidian(rootDir: string, maxDepth = 6): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const out: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    for (const entry of safeList(dir)) {
      if (entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      const stat = safeStat(full);
      if (!stat) continue;
      if (stat.isDirectory()) walk(full, depth + 1);
      else if (entry.endsWith(".md")) out.push(full);
    }
  }
  walk(rootDir, 0);
  return out;
}

export function obsidianRoot(cwd: string): string | null {
  const candidates = [path.join(cwd, "Obsidian"), path.join(cwd, "obsidian")];
  for (const c of candidates) {
    if (fs.existsSync(c) && safeStat(c)?.isDirectory()) return c;
  }
  return null;
}

function makeId(filePath: string): string {
  return Buffer.from(filePath).toString("base64url");
}

export function scanEditorSources(projects: ProjectSummary[]): EditorSource[] {
  const out: EditorSource[] = [];

  // Global
  for (const f of walkAgentsFiles(path.join(CLAUDE_DIR, "agents"))) {
    const meta = readMd(f, "agent");
    const stat = safeStat(f);
    out.push({
      id: makeId(f),
      name: meta.name ?? path.basename(f, ".md"),
      kind: "agent",
      source: "global",
      filePath: f,
      readonly: false,
      description: meta.description,
      mtimeMs: stat?.mtimeMs ?? 0,
    });
  }
  for (const f of walkSkillsFiles(path.join(CLAUDE_DIR, "skills"))) {
    const meta = readMd(f, "skill");
    const stat = safeStat(f);
    out.push({
      id: makeId(f),
      name: meta.name ?? path.basename(f, ".md"),
      kind: "skill",
      source: "global",
      filePath: f,
      readonly: false,
      description: meta.description,
      mtimeMs: stat?.mtimeMs ?? 0,
    });
  }

  // Per-project: agents, skills, obsidian
  for (const proj of projects) {
    if (!proj.cwd || !fs.existsSync(proj.cwd)) continue;
    for (const f of walkAgentsFiles(path.join(proj.cwd, ".claude", "agents"))) {
      const meta = readMd(f, "agent");
      const stat = safeStat(f);
      out.push({
        id: makeId(f),
        name: meta.name ?? path.basename(f, ".md"),
        kind: "agent",
        source: "project",
        projectKey: proj.projectKey,
        projectCwd: proj.cwd,
        filePath: f,
        readonly: false,
        description: meta.description,
        mtimeMs: stat?.mtimeMs ?? 0,
      });
    }
    for (const f of walkSkillsFiles(path.join(proj.cwd, ".claude", "skills"))) {
      const meta = readMd(f, "skill");
      const stat = safeStat(f);
      out.push({
        id: makeId(f),
        name: meta.name ?? path.basename(f, ".md"),
        kind: "skill",
        source: "project",
        projectKey: proj.projectKey,
        projectCwd: proj.cwd,
        filePath: f,
        readonly: false,
        description: meta.description,
        mtimeMs: stat?.mtimeMs ?? 0,
      });
    }
    const vault = obsidianRoot(proj.cwd);
    if (vault) {
      for (const f of walkObsidian(vault)) {
        const stat = safeStat(f);
        out.push({
          id: makeId(f),
          name: path.basename(f, ".md"),
          kind: "obsidian",
          source: "obsidian",
          projectKey: proj.projectKey,
          projectCwd: proj.cwd,
          filePath: f,
          readonly: false,
          mtimeMs: stat?.mtimeMs ?? 0,
        });
      }
    }
  }

  // Plugins (read-only)
  if (fs.existsSync(PLUGINS_CACHE)) {
    for (const owner of listSubdirs(PLUGINS_CACHE)) {
      const ownerDir = path.join(PLUGINS_CACHE, owner);
      for (const plugin of listSubdirs(ownerDir)) {
        const pluginDir = path.join(ownerDir, plugin);
        const versions = listSubdirs(pluginDir);
        const roots = versions.length > 0 ? versions.map((v) => path.join(pluginDir, v)) : [pluginDir];
        for (const root of roots) {
          for (const sub of [".claude/agents", "agents"]) {
            for (const f of walkAgentsFiles(path.join(root, sub))) {
              const meta = readMd(f, "agent");
              const stat = safeStat(f);
              out.push({
                id: makeId(f),
                name: meta.name ?? path.basename(f, ".md"),
                kind: "agent",
                source: "plugin",
                pluginName: plugin,
                filePath: f,
                readonly: true,
                description: meta.description,
                mtimeMs: stat?.mtimeMs ?? 0,
              });
            }
          }
          for (const sub of [".claude/skills", "skills"]) {
            for (const f of walkSkillsFiles(path.join(root, sub))) {
              const meta = readMd(f, "skill");
              const stat = safeStat(f);
              out.push({
                id: makeId(f),
                name: meta.name ?? path.basename(f, ".md"),
                kind: "skill",
                source: "plugin",
                pluginName: plugin,
                filePath: f,
                readonly: true,
                description: meta.description,
                mtimeMs: stat?.mtimeMs ?? 0,
              });
            }
          }
        }
      }
    }
  }

  // Dedupe: prefer project > global > plugin > obsidian
  const order: Record<EditorSource["source"], number> = {
    project: 0,
    global: 1,
    obsidian: 2,
    plugin: 3,
  };
  const byPath = new Map<string, EditorSource>();
  for (const s of out) {
    const key = normalize(s.filePath);
    const existing = byPath.get(key);
    if (!existing || order[s.source] < order[existing.source]) byPath.set(key, s);
  }

  return Array.from(byPath.values()).sort(
    (a, b) =>
      order[a.source] - order[b.source] ||
      a.kind.localeCompare(b.kind) ||
      a.name.localeCompare(b.name),
  );
}

export function isAllowedPath(absPath: string, projects: ProjectSummary[]): "rw" | "ro" | "deny" {
  const target = path.resolve(absPath);

  // Plugin cache → read-only
  if (isUnder(target, PLUGINS_CACHE)) return "ro";

  // Global ~/.claude/{agents,skills}
  if (
    isUnder(target, path.join(CLAUDE_DIR, "agents")) ||
    isUnder(target, path.join(CLAUDE_DIR, "skills"))
  ) {
    if (target.endsWith(".md")) return "rw";
    return "deny";
  }

  // Per-project
  for (const proj of projects) {
    if (!proj.cwd) continue;
    if (
      isUnder(target, path.join(proj.cwd, ".claude", "agents")) ||
      isUnder(target, path.join(proj.cwd, ".claude", "skills"))
    ) {
      if (target.endsWith(".md")) return "rw";
      return "deny";
    }
    const vault = obsidianRoot(proj.cwd);
    if (vault && isUnder(target, vault)) {
      if (target.endsWith(".md")) return "rw";
      return "deny";
    }
  }

  return "deny";
}

export function readEditorFile(absPath: string, projects: ProjectSummary[]): EditorFile {
  const access = isAllowedPath(absPath, projects);
  if (access === "deny") throw new Error("path is outside the editor whitelist");

  const sources = scanEditorSources(projects);
  const source =
    sources.find((s) => normalize(s.filePath) === normalize(absPath)) ??
    fallbackSource(absPath, projects, access);

  const content = fs.readFileSync(absPath, "utf8");
  const { frontmatter, body } = parseFrontmatter(content);
  return { source, content, frontmatter, body };
}

function fallbackSource(
  absPath: string,
  _projects: ProjectSummary[],
  access: "rw" | "ro",
): EditorSource {
  const stat = safeStat(absPath);
  return {
    id: makeId(absPath),
    name: path.basename(absPath, ".md"),
    kind: absPath.toLowerCase().includes(".claude/skills") ? "skill" : "agent",
    source: access === "ro" ? "plugin" : "project",
    filePath: absPath,
    readonly: access === "ro",
    mtimeMs: stat?.mtimeMs ?? 0,
  };
}

export function writeEditorFile(
  absPath: string,
  content: string,
  projects: ProjectSummary[],
): EditorFile {
  const access = isAllowedPath(absPath, projects);
  if (access === "deny") throw new Error("path is outside the editor whitelist");
  if (access === "ro") throw new Error("this source is read-only (plugin)");

  if (!absPath.endsWith(".md")) throw new Error("editor only writes .md files");
  if (typeof content !== "string") throw new Error("content must be a string");
  if (content.length > 4 * 1024 * 1024) throw new Error("content too large (>4MB)");

  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${absPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, absPath);

  return readEditorFile(absPath, projects);
}
