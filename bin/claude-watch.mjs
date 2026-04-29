#!/usr/bin/env node
// claude-watch — local supervision UI for Claude Code sessions.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = 1789;

const args = process.argv.slice(2);
const cmd = args[0] ?? "open";

if (cmd === "--help" || cmd === "-h" || cmd === "help") {
  printHelp();
  process.exit(0);
}

if (cmd === "dev") {
  runDev();
} else if (cmd === "open" || cmd === undefined) {
  runProd();
} else {
  console.error(`unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`claude-watch — supervise Claude Code on a second monitor

Usage:
  claude-watch              Launch UI (production build)
  claude-watch dev          Launch dev mode (hot reload)
  claude-watch open         Same as default
  claude-watch help         Show this help

Env:
  CLAUDE_WATCH_PORT         Server port (default ${DEFAULT_PORT})
  CLAUDE_WATCH_NO_BROWSER   Skip auto-open browser
`);
}

function openBrowser(url) {
  if (process.env.CLAUDE_WATCH_NO_BROWSER) return;
  try {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    console.log(`open ${url} in your browser`);
  }
}

function runDev() {
  const port = process.env.CLAUDE_WATCH_PORT ?? DEFAULT_PORT;
  const env = { ...process.env, CLAUDE_WATCH_PORT: String(port) };
  const isWin = process.platform === "win32";
  const child = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWin,
    env,
  });
  child.on("error", (err) => {
    console.error("[claude-watch] spawn failed:", err.message);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  setTimeout(() => openBrowser("http://localhost:1788"), 2500);
}

function runProd() {
  const port = process.env.CLAUDE_WATCH_PORT ?? DEFAULT_PORT;
  const dist = path.join(ROOT, "dist");
  if (!fs.existsSync(dist)) {
    console.error("dist/ missing — run `npm run build` first or use `claude-watch dev`.");
    process.exit(1);
  }
  const env = { ...process.env, CLAUDE_WATCH_PORT: String(port) };
  const isWin = process.platform === "win32";
  const tsxBin = path.join(ROOT, "node_modules", ".bin", isWin ? "tsx.cmd" : "tsx");
  const entry = path.join(ROOT, "server", "index.ts");
  const child = spawn(tsxBin, [entry], {
    cwd: ROOT,
    stdio: "inherit",
    env,
    shell: isWin,
  });
  child.on("error", (err) => {
    console.error("[claude-watch] spawn failed:", err.message);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  setTimeout(() => openBrowser(`http://127.0.0.1:${port}`), 1500);
}
