import { join } from "node:path"
import { read } from "./vault.js"
import { PROMPTS_DIR, STANDARDS, PROJECTS } from "./paths.js"

const GLOBAL_RULES = () => read(join(PROMPTS_DIR, "_global.md"))

export function loadSystemPrompt(agentId) {
  return read(join(PROMPTS_DIR, `${agentId}.md`))
}

export function projectContext(project) {
  if (!project) return ""
  const arch = read(join(PROJECTS, project, "context", "architecture.md"))
  return arch
}

export function globalStandards() {
  return read(join(STANDARDS, "global.md"))
}

// Monta o prompt final que vai pro stdin do CLI:
// regras globais + system prompt do agent + standards + contexto do projeto + payload da task + output path.
export function buildPrompt({ agentId, taskId, payload, project, outputPath, extraContext = "" }) {
  const sections = [
    `# [REGRAS GLOBAIS]`,
    GLOBAL_RULES(),
    ``,
    `# [SYSTEM PROMPT — ${agentId}]`,
    loadSystemPrompt(agentId),
    ``,
    `# [STANDARDS]`,
    globalStandards(),
    ``,
    `# [CONTEXTO DO PROJETO: ${project || "n/a"}]`,
    projectContext(project),
  ]

  if (extraContext) {
    sections.push(``, `# [CONTEXTO ADICIONAL]`, extraContext)
  }

  sections.push(
    ``,
    `# [TASK ID]`,
    taskId,
    ``,
    `# [OUTPUT PATH]`,
    outputPath,
    ``,
    `# [TASK PAYLOAD]`,
    payload || "",
  )

  return sections.filter(Boolean).join("\n")
}
