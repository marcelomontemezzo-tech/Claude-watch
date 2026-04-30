import { spawn } from "node:child_process"
import { log, status } from "./bus.js"

// Mapeia agent id → CLI binário + args base + modelo (informativo, repassado quando suportado).
export const MODEL_MAP = {
  intake:        { cli: "claude", args: ["--print"],            model: "claude-sonnet-4-6" },
  orchestrator:  { cli: "claude", args: ["--print"],            model: "claude-sonnet-4-6" },
  prompt_eng:    { cli: "claude", args: ["--print"],            model: "claude-sonnet-4-6" },
  frontend:      { cli: "claude", args: ["--print"],            model: "claude-opus-4-7"   },
  backend:       { cli: "codex",  args: ["exec", "--full-auto"], model: "gpt"              },
  qa:            { cli: "claude", args: ["--print"],            model: "claude-sonnet-4-6" },
  versioner:     { cli: "claude", args: ["--print"],            model: "claude-sonnet-4-6" },
  retrospective: { cli: "claude", args: ["--print"],            model: "claude-sonnet-4-6" },
}

// Spawna o CLI, manda prompt via stdin, faz streaming de stdout/stderr para o WS bus.
// Retorna stdout completo no resolve.
export function runAgent(agentId, prompt, { cwd, env, signal } = {}) {
  const cfg = MODEL_MAP[agentId]
  if (!cfg) return Promise.reject(new Error(`agent desconhecido: ${agentId}`))

  return new Promise((resolve, reject) => {
    status(agentId, "running")
    const proc = spawn(cfg.cli, cfg.args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...(env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    })

    let stdout = ""
    let stderr = ""

    proc.stdout.setEncoding("utf8")
    proc.stderr.setEncoding("utf8")

    proc.stdout.on("data", chunk => {
      stdout += chunk
      for (const line of chunk.split(/\r?\n/)) {
        if (line.length) log(agentId, line, "stdout")
      }
    })

    proc.stderr.on("data", chunk => {
      stderr += chunk
      for (const line of chunk.split(/\r?\n/)) {
        if (line.length) log(agentId, line, "stderr")
      }
    })

    proc.on("error", err => {
      status(agentId, "error", { message: err.message })
      reject(err)
    })

    proc.on("close", code => {
      if (code === 0) {
        status(agentId, "done")
        resolve({ stdout, stderr, code })
      } else {
        status(agentId, "error", { code, stderr: stderr.slice(-2000) })
        reject(new Error(`${agentId} (${cfg.cli}) saiu com código ${code}`))
      }
    })

    if (signal) {
      signal.addEventListener("abort", () => proc.kill("SIGTERM"), { once: true })
    }

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}
