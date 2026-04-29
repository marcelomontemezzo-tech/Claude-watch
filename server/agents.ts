import fs from "node:fs";
import path from "node:path";
import type { AgentDefinition, AgentKind } from "@shared/types.ts";
import { CLAUDE_DIR, PLUGINS_DIR } from "./paths.ts";

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
      name: fm.name ?? path.basename(filePath, ".md").replace(/^SKILL$/, path.basename(path.dirname(filePath))),
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

function walkAgentsDir(dir: string, source: AgentDefinition["source"], pluginName?: string): AgentDefinition[] {
  const out: AgentDefinition[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".md")) continue;
    const def = readMarkdownDef(path.join(dir, entry), "agent", source, pluginName);
    if (def) out.push(def);
  }
  return out;
}

function walkSkillsDir(dir: string, source: AgentDefinition["source"], pluginName?: string): AgentDefinition[] {
  const out: AgentDefinition[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
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

export function scanAgents(projectCwd: string | undefined): AgentDefinition[] {
  const all: AgentDefinition[] = [];

  // Global
  all.push(...walkAgentsDir(path.join(CLAUDE_DIR, "agents"), "global"));
  all.push(...walkSkillsDir(path.join(CLAUDE_DIR, "skills"), "global"));

  // Project-local
  if (projectCwd) {
    all.push(...walkAgentsDir(path.join(projectCwd, ".claude", "agents"), "project"));
    all.push(...walkSkillsDir(path.join(projectCwd, ".claude", "skills"), "project"));
  }

  // Plugin agents + skills
  const pluginsCache = path.join(PLUGINS_DIR, "cache");
  if (fs.existsSync(pluginsCache)) {
    for (const owner of safeList(pluginsCache)) {
      const ownerDir = path.join(pluginsCache, owner);
      for (const plugin of safeList(ownerDir)) {
        const pluginDir = path.join(ownerDir, plugin);
        for (const version of safeList(pluginDir)) {
          const versionDir = path.join(pluginDir, version);
          all.push(...walkAgentsDir(path.join(versionDir, "agents"), "plugin", plugin));
          all.push(...walkSkillsDir(path.join(versionDir, "skills"), "plugin", plugin));
        }
      }
    }
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
      Number(a.kind === "skill") - Number(b.kind === "skill") || a.name.localeCompare(b.name),
  );
}

function safeList(p: string): string[] {
  try {
    return fs.readdirSync(p).filter((f) => {
      try {
        return fs.statSync(path.join(p, f)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
