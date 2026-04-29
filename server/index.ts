import express, { type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WatcherStore } from "./watcher.ts";
import { buildAgentDetail, writeAgentDetail } from "./agent-detail.ts";
import type { DashboardSnapshot, ServerEvent } from "@shared/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CLAUDE_WATCH_PORT ?? 1789);
const STATIC_DIR = path.resolve(__dirname, "..", "dist").replace(/\\/g, "/");

async function main(): Promise<void> {
  const store = new WatcherStore();
  await store.start();

  const app = express();

  console.log(`[claude-watch] static dir: ${STATIC_DIR} (exists=${fs.existsSync(STATIC_DIR)})`);
  if (fs.existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR, { index: "index.html" }));
  }

  app.use(express.json({ limit: "1mb" }));

  let lastSnapshot: DashboardSnapshot = store.buildSnapshot();
  let lastSnapshotHash = snapshotHash(lastSnapshot);
  store.on("snapshot", (snap: DashboardSnapshot) => {
    const hash = snapshotHash(snap);
    lastSnapshot = snap;
    if (hash === lastSnapshotHash) return;
    lastSnapshotHash = hash;
    broadcast({ type: "snapshot", payload: snap });
  });

  const clients = new Set<Response>();
  function broadcast(event: ServerEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }

  setInterval(() => {
    broadcast({ type: "heartbeat", payload: { ts: Date.now() } });
  }, 15_000).unref();

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), sessions: lastSnapshot.projects.length });
  });

  app.get("/api/snapshot", (_req, res) => {
    res.json(lastSnapshot);
  });

  app.get("/api/agents/:agentName", async (req, res) => {
    const agentName = req.params.agentName;
    const projectKey = (req.query.project as string | undefined) ?? null;
    const project = lastSnapshot.projects.find((p) => p.projectKey === projectKey);
    try {
      const detail = await buildAgentDetail(agentName, projectKey, project?.cwd ?? null);
      if (!detail) {
        res.status(404).json({ error: "agent not found" });
        return;
      }
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: String((err as Error).message ?? err) });
    }
  });

  app.put("/api/agents/:agentName", async (req, res) => {
    const agentName = req.params.agentName;
    const projectKey = (req.query.project as string | undefined) ?? null;
    const project = lastSnapshot.projects.find((p) => p.projectKey === projectKey);
    const body = req.body as { content?: string; model?: string | null };
    try {
      const detail = await buildAgentDetail(agentName, projectKey, project?.cwd ?? null);
      if (!detail) {
        res.status(404).json({ error: "agent not found" });
        return;
      }
      writeAgentDetail(detail.filePath, body);
      const updated = await buildAgentDetail(agentName, projectKey, project?.cwd ?? null);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: String((err as Error).message ?? err) });
    }
  });

  const launchCooldown = new Map<string, number>();
  const COOLDOWN_MS = 3_000;

  app.post("/api/projects/:projectKey/launch-claude", (req, res) => {
    const projectKey = req.params.projectKey;
    const project = lastSnapshot.projects.find((p) => p.projectKey === projectKey);
    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    const last = launchCooldown.get(projectKey) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      res.json({ ok: true, status: "cooldown", projectKey });
      return;
    }
    launchCooldown.set(projectKey, Date.now());

    const cwd = project.cwd;
    if (!cwd || !fs.existsSync(cwd)) {
      res.status(400).json({ error: "project cwd does not exist", cwd });
      return;
    }

    try {
      if (process.platform === "win32") {
        const wt = spawn(
          "wt.exe",
          ["-d", cwd, "cmd.exe", "/k", "claude"],
          { detached: true, stdio: "ignore" },
        );
        wt.on("error", () => {
          spawn(
            "cmd.exe",
            ["/c", "start", "claude", "cmd.exe", "/k", "claude"],
            { cwd, detached: true, stdio: "ignore", shell: false },
          ).unref();
        });
        wt.unref();
      } else if (process.platform === "darwin") {
        const script = `tell application "Terminal" to do script "cd ${cwd.replace(/"/g, '\\"')} && claude"`;
        spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" }).unref();
      } else {
        const cmd = `cd "${cwd.replace(/"/g, '\\"')}" && claude; exec bash`;
        const term = spawn("x-terminal-emulator", ["-e", "bash", "-c", cmd], {
          detached: true,
          stdio: "ignore",
        });
        term.on("error", () => {
          spawn("gnome-terminal", ["--", "bash", "-c", cmd], {
            detached: true,
            stdio: "ignore",
          }).unref();
        });
        term.unref();
      }
      res.json({ ok: true, status: "launched", projectKey, cwd });
    } catch (err) {
      res.status(500).json({ error: String((err as Error).message ?? err) });
    }
  });

  app.post("/api/agents/:agentName/open", async (req, res) => {
    const agentName = req.params.agentName;
    const projectKey = (req.query.project as string | undefined) ?? null;
    const project = lastSnapshot.projects.find((p) => p.projectKey === projectKey);
    try {
      const detail = await buildAgentDetail(agentName, projectKey, project?.cwd ?? null);
      if (!detail) {
        res.status(404).json({ error: "agent not found" });
        return;
      }
      const target = detail.filePath;
      if (process.platform === "win32") {
        spawn("cmd.exe", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
      } else if (process.platform === "darwin") {
        spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
      } else {
        spawn("xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
      }
      res.json({ ok: true, path: target });
    } catch (err) {
      res.status(500).json({ error: String((err as Error).message ?? err) });
    }
  });

  app.get("/events", (req: Request, res: Response) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: "snapshot", payload: lastSnapshot })}\n\n`);
    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
    });
  });

  if (fs.existsSync(STATIC_DIR)) {
    const indexHtml = path.join(STATIC_DIR, "index.html");
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      if (req.path.startsWith("/api") || req.path === "/events") return next();
      res.sendFile(indexHtml, (err) => {
        if (err) next(err);
      });
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[claude-watch] server http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[claude-watch] fatal", err);
  process.exit(1);
});

function snapshotHash(snap: DashboardSnapshot): string {
  const projectsKey = snap.projects
    .map((p) => `${p.projectKey}:${p.lastActivityAt}:${p.totalTokens}:${p.isLive ? 1 : 0}`)
    .join(";");
  const eventsLen = snap.recentEvents?.length ?? 0;
  const flowKey = snap.flow ? `${snap.flow.nodes.length}n${snap.flow.edges.length}e` : "0";
  return `${snap.activeProjectKey ?? ""}|${projectsKey}|${eventsLen}|${flowKey}`;
}
