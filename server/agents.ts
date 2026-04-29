import fs from "node:fs";
import path from "node:path";
import type { AgentDefinition, AgentKind } from "@shared/types.ts";
import { CLAUDE_DIR, PLUGINS_CACHE, PLUGINS_MANIFEST } from "./paths.ts";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return {};
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
  return out;
}

function readMarkdownDef(
  filePath: string,
  kind: AgentKind,
  source: AgentDefinition["source"],
  pluginName?: string,
): AgentDefinition | null {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const fm = parseFrontmatter(text);
    return {
      name:
        fm.name ??
        path
          .basename(filePath, ".md")
          .replace(/^SKILL$/, path.basename(path.dirname(filePath))),
      kind,
      source,
      pluginName,
      description: fm.description,
      filePath,
    };
  } catch {
    return null;
  }
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

function walkAgentsDir(
  dir: string,
  source: AgentDefinition["source"],
  pluginName?: string,
): AgentDefinition[] {
  const out: AgentDefinition[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of safeList(dir)) {
    if (!entry.endsWith(".md")) continue;
    const def = readMarkdownDef(path.join(dir, entry), "agent", source, pluginName);
    if (def) out.push(def);
  }
  return out;
}

function walkSkillsDir(
  dir: string,
  source: AgentDefinition["source"],
  pluginName?: string,
): AgentDefinition[] {
  const out: AgentDefinition[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of safeList(dir)) {
    const full = path.join(dir, entry);
    const stat = safeStat(full);
    if (!stat) continue;
    if (stat.isDirectory()) {
      const skillFile = path.join(full, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        const def = readMarkdownDef(skillFile, "skill", source, pluginName);
        if (def) out.push(def);
      }
    } else if (entry.endsWith(".md")) {
      const def = readMarkdownDef(full, "skill", source, pluginName);
      if (def) out.push(def);
    }
  }
  return out;
}

const PLUGIN_LAYOUTS: Array<{ rel: string[]; kind: AgentKind }> = [
  { rel: ["agents"], kind: "agent" },
  { rel: ["skills"], kind: "skill" },
  { rel: [".claude", "agents"], kind: "agent" },
  { rel: [".claude", "skills"], kind: "skill" },
];

function scanPluginRoot(
  rootDir: string,
  pluginName: string,
): AgentDefinition[] {
  const out: AgentDefinition[] = [];
  if (!fs.existsSync(rootDir)) return out;

  for (const { rel, kind } of PLUGIN_LAYOUTS) {
    const target = path.join(rootDir, ...rel);
    if (kind === "agent") out.push(...walkAgentsDir(target, "plugin", pluginName));
    else out.push(...walkSkillsDir(target, "plugin", pluginName));
  }

  // Nested layout: <root>/plugins/<sub>/{agents,skills}
  const nested = path.join(rootDir, "plugins");
  if (fs.existsSync(nested)) {
    for (const sub of listSubdirs(nested)) {
      const subRoot = path.join(nested, sub);
      out.push(...walkAgentsDir(path.join(subRoot, "agents"), "plugin", sub));
      out.push(...walkSkillsDir(path.join(subRoot, "skills"), "plugin", sub));
    }
  }

  return out;
}

interface InstalledPluginsManifest {
  version?: number;
  plugins?: Record<
    string,
    Array<{
      installPath?: string;
      version?: string;
      scope?: string;
    }>
  >;
}

function readManifest(): InstalledPluginsManifest | null {
  if (!fs.existsSync(PLUGINS_MANIFEST)) return null;
  try {
    const txt = fs.readFileSync(PLUGINS_MANIFEST, "utf8");
    return JSON.parse(txt) as InstalledPluginsManifest;
  } catch {
    return null;
  }
}

function discoverPluginRoots(): Array<{ name: string; root: string }> {
  const found: Array<{ name: string; root: string }> = [];
  const seen = new Set<string>();

  // 1. Manifest is the authoritative source
  const manifest = readManifest();
  if (manifest?.plugins) {
    for (const [key, installs] of Object.entries(manifest.plugins)) {
      const pluginName = key.split("@")[0] ?? key;
      for (const install of installs ?? []) {
        const root = install.installPath;
        if (!root) continue;
        if (seen.has(root)) continue;
        if (!fs.existsSync(root)) continue;
        seen.add(root);
        found.push({ name: pluginName, root });
      }
    }
  }

  // 2. Fallback: walk cache directory <owner>/<plugin>/<version>
  if (fs.existsSync(PLUGINS_CACHE)) {
    for (const owner of listSubdirs(PLUGINS_CACHE)) {
      const ownerDir = path.join(PLUGINS_CACHE, owner);
      for (const plugin of listSubdirs(ownerDir)) {
        const pluginDir = path.join(ownerDir, plugin);
        const versions = listSubdirs(pluginDir);
        if (versions.length === 0) {
          if (!seen.has(pluginDir)) {
            seen.add(pluginDir);
            found.push({ name: plugin, root: pluginDir });
          }
          continue;
        }
        for (const version of versions) {
          const versionDir = path.join(pluginDir, version);
          if (seen.has(versionDir)) continue;
          seen.add(versionDir);
          found.push({ name: plugin, root: versionDir });
        }
      }
    }
  }

  return found;
}

export function scanAgents(projectCwd: string | undefined): AgentDefinition[] {
  const all: AgentDefinition[] = [];

  // Global (~/.claude)
  all.push(...walkAgentsDir(path.join(CLAUDE_DIR, "agents"), "global"));
  all.push(...walkSkillsDir(path.join(CLAUDE_DIR, "skills"), "global"));

  // Project-local (<cwd>/.claude)
  if (projectCwd && fs.existsSync(projectCwd)) {
    all.push(...walkAgentsDir(path.join(projectCwd, ".claude", "agents"), "project"));
    all.push(...walkSkillsDir(path.join(projectCwd, ".claude", "skills"), "project"));
  }

  // Plugins
  for (const { name, root } of discoverPluginRoots()) {
    all.push(...scanPluginRoot(root, name));
  }

  // Dedup by kind+name preferring project > global > plugin
  const order: AgentDefinition["source"][] = ["project", "global", "plugin"];
  const byKey = new Map<string, AgentDefinition>();
  for (const a of all) {
    const key = `${a.kind}:${a.name}`;
    const existing = byKey.get(key);
    if (!existing || order.indexOf(a.source) < order.indexOf(existing.source)) {
      byKey.set(key, a);
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) =>
      Number(a.kind === "skill") - Number(b.kind === "skill") ||
      a.name.localeCompare(b.name),
  );
}
