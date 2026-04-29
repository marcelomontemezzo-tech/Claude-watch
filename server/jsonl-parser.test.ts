import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseJsonlFile } from "./jsonl-parser.ts";

const tmpFiles: string[] = [];

afterEach(() => {
  while (tmpFiles.length) {
    const f = tmpFiles.pop();
    if (f && fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  }
});

function writeJsonl(lines: unknown[]): string {
  const tmpDir = os.tmpdir().replace(/\\/g, "/");
  const filePath = path.posix.normalize(
    `${tmpDir}/claude-watch-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  fs.writeFileSync(filePath, body, "utf8");
  tmpFiles.push(filePath);
  return filePath;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

const SESSION_ID = "11111111-1111-1111-1111-111111111111";

function userPromptLine(ts: number, text = "hello") {
  return {
    type: "user",
    sessionId: SESSION_ID,
    cwd: "/tmp/proj",
    version: "1.0.0",
    timestamp: iso(ts),
    parentUuid: null,
    uuid: `u-${ts}`,
    isSidechain: false,
    message: { role: "user", content: text },
  };
}

function assistantWithTools(
  ts: number,
  tools: { id: string; name: string; input: Record<string, unknown> }[],
) {
  return {
    type: "assistant",
    sessionId: SESSION_ID,
    cwd: "/tmp/proj",
    version: "1.0.0",
    timestamp: iso(ts),
    parentUuid: `u-${ts - 1}`,
    uuid: `a-${ts}`,
    isSidechain: false,
    message: {
      id: `msg-${ts}`,
      role: "assistant",
      model: "claude-opus-4-7",
      content: tools.map((t) => ({
        type: "tool_use",
        id: t.id,
        name: t.name,
        input: t.input,
      })),
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  };
}

function toolResultLine(
  ts: number,
  toolUseId: string,
  content: string,
  isError = false,
) {
  return {
    type: "user",
    sessionId: SESSION_ID,
    cwd: "/tmp/proj",
    version: "1.0.0",
    timestamp: iso(ts),
    parentUuid: null,
    uuid: `r-${toolUseId}`,
    isSidechain: false,
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content,
          is_error: isError,
        },
      ],
    },
  };
}

describe("parseJsonlFile", () => {
  it("marks subagent done when tool_result is paired with Task tool_use", async () => {
    const now = Date.now();
    const file = writeJsonl([
      userPromptLine(now - 10_000, "kick off"),
      assistantWithTools(now - 9_000, [
        {
          id: "tool_task_1",
          name: "Task",
          input: {
            subagent_type: "researcher",
            description: "find stuff",
            prompt: "research X",
          },
        },
      ]),
      toolResultLine(now - 8_000, "tool_task_1", "all good"),
    ]);

    const parsed = await parseJsonlFile(file);
    expect(parsed).not.toBeNull();
    const node = parsed!.flow.nodes.find((n) => n.id === "tool_task_1");
    expect(node).toBeDefined();
    expect(node!.kind).toBe("agent");
    expect(node!.agentType).toBe("researcher");
    expect(node!.status).toBe("done");
    expect(node!.endedAt).toBe(now - 8_000);
  });

  it("falls back to done when Task has no tool_result and last activity is older than 30s", async () => {
    const now = Date.now();
    const stale = now - 60_000;
    const file = writeJsonl([
      userPromptLine(stale - 2_000, "kick off"),
      assistantWithTools(stale - 1_000, [
        {
          id: "tool_task_stale",
          name: "Task",
          input: {
            subagent_type: "writer",
            description: "draft",
            prompt: "write Y",
          },
        },
      ]),
      // no tool_result; last activity = assistant ts = stale - 1_000 (>30s old)
    ]);

    const parsed = await parseJsonlFile(file);
    const node = parsed!.flow.nodes.find((n) => n.id === "tool_task_stale");
    expect(node).toBeDefined();
    expect(node!.status).toBe("done");
    expect(node!.durationMs).toBeNull();
  });

  it("keeps Task running when no tool_result and last activity is within 30s", async () => {
    const now = Date.now();
    const fresh = now - 5_000;
    const file = writeJsonl([
      userPromptLine(fresh - 2_000, "kick off"),
      assistantWithTools(fresh, [
        {
          id: "tool_task_fresh",
          name: "Task",
          input: {
            subagent_type: "engineer",
            description: "build",
            prompt: "implement Z",
          },
        },
      ]),
    ]);

    const parsed = await parseJsonlFile(file);
    const node = parsed!.flow.nodes.find((n) => n.id === "tool_task_fresh");
    expect(node).toBeDefined();
    expect(node!.status).toBe("running");
    expect(node!.durationMs).toBeNull();
  });

  it("marks status error when tool_result has is_error: true", async () => {
    const now = Date.now();
    const file = writeJsonl([
      userPromptLine(now - 10_000, "kick"),
      assistantWithTools(now - 9_000, [
        {
          id: "tool_task_err",
          name: "Task",
          input: {
            subagent_type: "qa",
            description: "verify",
            prompt: "test it",
          },
        },
      ]),
      toolResultLine(now - 8_000, "tool_task_err", "boom: it failed", true),
    ]);

    const parsed = await parseJsonlFile(file);
    const node = parsed!.flow.nodes.find((n) => n.id === "tool_task_err");
    expect(node).toBeDefined();
    expect(node!.status).toBe("error");
    expect(node!.errorMessage).toBe("boom: it failed");
  });

  it("Skill tool: agentType from input.skill, kind 'skill'", async () => {
    const now = Date.now();
    const file = writeJsonl([
      userPromptLine(now - 10_000, "kick"),
      assistantWithTools(now - 9_000, [
        {
          id: "tool_skill_1",
          name: "Skill",
          input: {
            skill: "hm-engineer",
            args: "review the parser",
          },
        },
      ]),
      toolResultLine(now - 8_000, "tool_skill_1", "skill complete"),
    ]);

    const parsed = await parseJsonlFile(file);
    const node = parsed!.flow.nodes.find((n) => n.id === "tool_skill_1");
    expect(node).toBeDefined();
    expect(node!.kind).toBe("skill");
    expect(node!.agentType).toBe("hm-engineer");
    expect(node!.description).toBe("review the parser");
    expect(node!.status).toBe("done");
  });

  it("two Task calls in the same assistant turn share a parallelGroupId", async () => {
    const now = Date.now();
    const file = writeJsonl([
      userPromptLine(now - 10_000, "fan out"),
      assistantWithTools(now - 9_000, [
        {
          id: "tool_task_a",
          name: "Task",
          input: {
            subagent_type: "researcher",
            description: "branch A",
            prompt: "do A",
          },
        },
        {
          id: "tool_task_b",
          name: "Task",
          input: {
            subagent_type: "researcher",
            description: "branch B",
            prompt: "do B",
          },
        },
      ]),
      toolResultLine(now - 8_500, "tool_task_a", "A ok"),
      toolResultLine(now - 8_000, "tool_task_b", "B ok"),
    ]);

    const parsed = await parseJsonlFile(file);
    const a = parsed!.flow.nodes.find((n) => n.id === "tool_task_a");
    const b = parsed!.flow.nodes.find((n) => n.id === "tool_task_b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.parallelGroupId).not.toBeNull();
    expect(a!.parallelGroupId).toBe(b!.parallelGroupId);
    expect(a!.turnIndex).toBe(b!.turnIndex);
    // both edges flagged parallel
    const edgeA = parsed!.flow.edges.find((e) => e.target === "tool_task_a");
    const edgeB = parsed!.flow.edges.find((e) => e.target === "tool_task_b");
    expect(edgeA?.parallel).toBe(true);
    expect(edgeB?.parallel).toBe(true);
  });
});
