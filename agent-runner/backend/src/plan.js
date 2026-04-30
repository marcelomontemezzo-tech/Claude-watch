// Parser tolerante do plano produzido pelo Orchestrator.
// O Orchestrator escreve markdown semi-estruturado; aqui extraímos:
//   subtasks: [{ id, agent, model, depends_on, token_budget, objetivo, context_files, qa_criteria }]
//   groups:   [[id,...], [id,...]] (ordem de execução; cada grupo é paralelo internamente)

const SUBTASK_HEADER = /^\s*\d+\.\s*id:\s*(\S+)/i
const FIELD = /^\s*([a-z_]+)\s*:\s*(.+)$/i
const GROUP = /^\s*-\s*group_\d+\s*:\s*\[(.+)\]/i

export function parsePlan(markdown) {
  const lines = markdown.split(/\r?\n/)
  const subtasks = []
  const groups = []
  let current = null
  let inSubtasksSection = false
  let inGroupsSection = false

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (/^###\s+Subtasks/i.test(line)) { inSubtasksSection = true; inGroupsSection = false; continue }
    if (/^###\s+Grupos\s+paralelos/i.test(line)) { inSubtasksSection = false; inGroupsSection = true; continue }
    if (/^###\s+/.test(line))               { inSubtasksSection = false; inGroupsSection = false; continue }

    if (inSubtasksSection) {
      const head = line.match(SUBTASK_HEADER)
      if (head) {
        if (current) subtasks.push(current)
        current = { id: head[1], depends_on: [], context_files: [], qa_criteria: [] }
        continue
      }
      const f = line.match(FIELD)
      if (f && current) {
        const key = f[1].toLowerCase()
        const val = f[2].trim()
        if (key === "depends_on" || key === "context_files" || key === "qa_criteria") {
          current[key] = val
            .replace(/^\[|\]$/g, "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
        } else if (key === "token_budget") {
          current[key] = parseInt(val, 10) || 0
        } else {
          current[key] = val
        }
      }
    }

    if (inGroupsSection) {
      const g = line.match(GROUP)
      if (g) {
        const ids = g[1].split(",").map(s => s.trim()).filter(Boolean)
        groups.push(ids)
      }
    }
  }
  if (current) subtasks.push(current)

  // Fallback: se Orchestrator não declarou grupos, derive por dependências.
  const finalGroups = groups.length ? groups : deriveGroups(subtasks)
  return { subtasks, groups: finalGroups }
}

function deriveGroups(subtasks) {
  const remaining = new Map(subtasks.map(s => [s.id, new Set(s.depends_on || [])]))
  const out = []
  while (remaining.size) {
    const ready = []
    for (const [id, deps] of remaining) {
      if (deps.size === 0) ready.push(id)
    }
    if (!ready.length) {
      // ciclo ou dep inválida — empurra o resto e quebra.
      out.push([...remaining.keys()])
      break
    }
    out.push(ready)
    for (const id of ready) {
      remaining.delete(id)
      for (const deps of remaining.values()) deps.delete(id)
    }
  }
  return out
}

export function parseQaStatus(qaMarkdown) {
  if (!qaMarkdown) return null
  const m = qaMarkdown.match(/^status:\s*(approved|rejected)\s*$/im)
  return m ? m[1].toLowerCase() : null
}
