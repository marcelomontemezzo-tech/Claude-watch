import fs from "node:fs";
import path from "node:path";
import type { MemoryBank, MemoryEntry } from "@shared/types.ts";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;

function parseFm(content: string): Record<string, string> {
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

function classifyByName(name: string): MemoryEntry["kind"] {
  const lower = name.toLowerCase();
  if (lower.startsWith("feedback")) return "feedback";
  if (lower.startsWith("user")) return "user";
  if (lower.startsWith("reference")) return "reference";
  if (lower === "claude.md") return "claude-md";
  return "project";
}

function readPreview(filePath: string, max = 240): string {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const stripped = raw.replace(FRONTMATTER_RE, "").trim();
    return stripped.slice(0, max).replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

function readClaudeProjectMemory(projectKey: string): MemoryEntry[] {
  const dir = path.join(process.env.USERPROFILE || process.env.HOME || "", ".claude", "projects", projectKey, "memory");
  if (!fs.existsSync(dir)) return [];
  const out: MemoryEntry[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    let text = "";
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch {}
    const fm = parseFm(text);
    out.push({
      id: `claude-mem:${projectKey}:${entry}`,
      kind: (fm.type as MemoryEntry["kind"] | undefined) ?? classifyByName(entry),
      name: fm.name ?? entry.replace(/\.md$/, ""),
      description: fm.description,
      filePath,
      preview: readPreview(filePath),
      modifiedAt: stat.mtimeMs,
      size: stat.size,
    });
  }
  return out;
}

function readClaudeMd(projectCwd: string): MemoryEntry | null {
  const filePath = path.join(projectCwd, "CLAUDE.md");
  if (!fs.existsSync(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    return {
      id: `claude-md:${projectCwd}`,
      kind: "claude-md",
      name: "CLAUDE.md",
      description: "Project instructions for Claude",
      filePath,
      preview: readPreview(filePath, 320),
      modifiedAt: stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

function findObsidianRoot(projectCwd: string): string | null {
  const candidates = ["Obsidian", "obsidian", "vault", "Vault"];
  for (const c of candidates) {
    const p = path.join(projectCwd, c);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return null;
}

function summarizeObsidian(root: string): MemoryBank["obsidianSummary"] {
  const folders: { name: string; fileCount: number }[] = [];
  let total = 0;
  const stack: string[] = [];
  for (const entry of fs.readdirSync(root)) {
    const full = path.join(root, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      stack.push(full);
      let count = 0;
      walkCount(full, (f) => {
        if (f.endsWith(".md") || f.endsWith(".canvas") || f.endsWith(".base")) count += 1;
      });
      folders.push({ name: entry, fileCount: count });
      total += count;
    } else if (entry.endsWith(".md")) {
      total += 1;
    }
  }
  folders.sort((a, b) => b.fileCount - a.fileCount);
  return { rootPath: root, folders: folders.slice(0, 12), totalFiles: total };
}

function walkCount(dir: string, onFile: (name: string) => void, depth = 0): void {
  if (depth > 4) return;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkCount(full, onFile, depth + 1);
    } else {
      onFile(entry);
    }
  }
}

function readRecentMarkdown(root: string, limit = 6): MemoryEntry[] {
  const out: MemoryEntry[] = [];
  walkRecent(root, out, 0);
  return out
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, limit);
}

function walkRecent(dir: string, out: MemoryEntry[], depth: number): void {
  if (depth > 4 || out.length > 200) return;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkRecent(full, out, depth + 1);
    } else if (entry.endsWith(".md")) {
      out.push({
        id: `obsidian:${full}`,
        kind: "obsidian",
        name: entry.replace(/\.md$/, ""),
        filePath: full,
        modifiedAt: stat.mtimeMs,
        size: stat.size,
      });
    }
  }
}

export function buildMemoryBank(projectKey: string, projectCwd: string): MemoryBank {
  const entries: MemoryEntry[] = [];
  entries.push(...readClaudeProjectMemory(projectKey));
  const claudeMd = readClaudeMd(projectCwd);
  if (claudeMd) entries.push(claudeMd);

  const obsidianRoot = findObsidianRoot(projectCwd);
  let obsidianSummary: MemoryBank["obsidianSummary"];
  if (obsidianRoot) {
    obsidianSummary = summarizeObsidian(obsidianRoot);
    entries.push(...readRecentMarkdown(obsidianRoot, 8));
  }

  entries.sort((a, b) => b.modifiedAt - a.modifiedAt);

  return {
    entries,
    obsidianSummary,
    totalEntries: entries.length,
  };
}
