import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const ROOT = resolve(__dirname, "..", "..", "..")
export const VAULT = resolve(ROOT, "vault")
export const PROJECTS = resolve(ROOT, "projects")
export const PROMPTS_DIR = resolve(ROOT, "agent-runner", "agents", "prompts")

export const TASKS = {
  inbox: resolve(VAULT, "tasks", "inbox"),
  planning: resolve(VAULT, "tasks", "planning"),
  ready: resolve(VAULT, "tasks", "ready"),
  inProgress: resolve(VAULT, "tasks", "in-progress"),
  done: resolve(VAULT, "tasks", "done"),
  fix: resolve(VAULT, "tasks", "fix"),
  qaApproved: resolve(VAULT, "tasks", "qa_approved"),
  versioned: resolve(VAULT, "tasks", "versioned"),
}

export const ERRORS = resolve(VAULT, "errors")
export const MEMORY = resolve(VAULT, "memory")
export const STANDARDS = resolve(VAULT, "context", "standards")
