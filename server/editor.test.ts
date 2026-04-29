import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "@shared/types.ts";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-watch-editor-"));
  process.env.USERPROFILE = tmp;
  process.env.HOME = tmp;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function loadEditor(): Promise<typeof import("./editor.ts")> {
  return import("./editor.ts");
}

function makeProject(cwd: string): ProjectSummary {
  return {
    projectKey: "p",
    cwd,
    displayName: "p",
    sessionCount: 0,
    activeSessionId: null,
    totalTokens: 0,
    totalCost: 0,
    lastActivityAt: 0,
    isLive: false,
  };
}

describe("editor whitelist", () => {
  it("denies paths outside the whitelist", async () => {
    const editor = await loadEditor();
    const projects = [makeProject(path.join(tmp, "proj"))];
    const target = path.join(tmp, "secrets.txt");
    expect(editor.isAllowedPath(target, projects)).toBe("deny");
  });

  it("allows .md files under the project .claude/skills tree", async () => {
    const editor = await loadEditor();
    const proj = path.join(tmp, "proj");
    fs.mkdirSync(path.join(proj, ".claude", "skills", "agent-x"), { recursive: true });
    const target = path.join(proj, ".claude", "skills", "agent-x", "SKILL.md");
    fs.writeFileSync(target, "# x", "utf8");
    expect(editor.isAllowedPath(target, [makeProject(proj)])).toBe("rw");
  });

  it("allows .md files inside an Obsidian vault under the project cwd", async () => {
    const editor = await loadEditor();
    const proj = path.join(tmp, "proj");
    fs.mkdirSync(path.join(proj, "Obsidian", "Notes"), { recursive: true });
    const target = path.join(proj, "Obsidian", "Notes", "n.md");
    fs.writeFileSync(target, "# note", "utf8");
    expect(editor.isAllowedPath(target, [makeProject(proj)])).toBe("rw");
  });

  it("marks plugin cache paths as read-only", async () => {
    const editor = await loadEditor();
    const cache = path.join(tmp, ".claude", "plugins", "cache", "p", "v1");
    fs.mkdirSync(path.join(cache, "skills", "k"), { recursive: true });
    const target = path.join(cache, "skills", "k", "SKILL.md");
    fs.writeFileSync(target, "# k", "utf8");
    expect(editor.isAllowedPath(target, [])).toBe("ro");
  });
});

describe("editor write", () => {
  it("writes a project skill atomically and refreshes the read", async () => {
    const editor = await loadEditor();
    const proj = path.join(tmp, "proj");
    fs.mkdirSync(path.join(proj, ".claude", "skills", "agent-x"), { recursive: true });
    const target = path.join(proj, ".claude", "skills", "agent-x", "SKILL.md");
    fs.writeFileSync(target, "---\nname: x\n---\noriginal", "utf8");

    const projects = [makeProject(proj)];
    const result = editor.writeEditorFile(target, "---\nname: x\n---\nupdated", projects);

    expect(result.body).toBe("updated");
    expect(fs.readFileSync(target, "utf8")).toContain("updated");
  });

  it("refuses to write a plugin (read-only) source", async () => {
    const editor = await loadEditor();
    const cache = path.join(tmp, ".claude", "plugins", "cache", "p", "v1");
    fs.mkdirSync(path.join(cache, "skills", "k"), { recursive: true });
    const target = path.join(cache, "skills", "k", "SKILL.md");
    fs.writeFileSync(target, "# k", "utf8");
    expect(() => editor.writeEditorFile(target, "evil", [])).toThrow(/read-only/);
  });

  it("refuses to write outside the whitelist", async () => {
    const editor = await loadEditor();
    const target = path.join(tmp, "rogue.md");
    expect(() => editor.writeEditorFile(target, "x", [])).toThrow(/whitelist/);
  });
});
