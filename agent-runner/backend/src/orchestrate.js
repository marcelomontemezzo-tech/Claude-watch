import { join } from "node:path"
import { existsSync } from "node:fs"
import { customAlphabet } from "nanoid"
import { TASKS, ERRORS } from "./paths.js"
import { read, write, move, list, readWithFrontmatter } from "./vault.js"
import { runAgent, MODEL_MAP } from "./agents.js"
import { buildPrompt } from "./prompts.js"
import { parsePlan, parseQaStatus } from "./plan.js"
import { log, pipelineEvent } from "./bus.js"

const idGen = customAlphabet("0123456789", 4)

export function newTaskId() {
  const ts = new Date()
  const ymd = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(ts.getDate()).padStart(2, "0")}`
  return `TASK-${ymd}-${idGen()}`
}

export async function runPipeline({ taskRaw, project = "torque" }, { signal } = {}) {
  const taskId = newTaskId()
  pipelineEvent(taskId, "init", "start", { project })

  try {
    // -------- Stage 0: persist raw --------
    const inboxPath = join(TASKS.inbox, `${taskId}.md`)
    write(inboxPath, framedRaw(taskId, project, taskRaw))

    // -------- Stage 1: Intake --------
    pipelineEvent(taskId, "intake", "start")
    const planningOut = join(TASKS.planning, `${taskId}.md`)
    await callAgent("intake", {
      taskId, project, payload: taskRaw, outputPath: planningOut, signal,
    })
    requireFile(planningOut, "intake não escreveu planning")
    pipelineEvent(taskId, "intake", "done")

    // -------- Stage 2: Orchestrator --------
    pipelineEvent(taskId, "orchestrator", "start")
    const planPath = join(TASKS.planning, `${taskId}-plan.md`)
    const planningContent = read(planningOut)
    await callAgent("orchestrator", {
      taskId, project, payload: planningContent, outputPath: planPath, signal,
    })
    requireFile(planPath, "orchestrator não escreveu plan")
    const plan = parsePlan(read(planPath))
    if (!plan.subtasks.length) throw new Error("plan vazio: orchestrator não produziu subtasks")
    pipelineEvent(taskId, "orchestrator", "done", { subtasks: plan.subtasks.length, groups: plan.groups.length })

    // -------- Stage 3: Prompt Engineer --------
    pipelineEvent(taskId, "prompt_eng", "start")
    // PE escreve um arquivo por subtask em vault/tasks/ready/<subId>.md.
    // Output path coletivo é a planning dir; passamos o plano como payload.
    const peManifest = join(TASKS.planning, `${taskId}-prompts.md`)
    await callAgent("prompt_eng", {
      taskId, project, payload: read(planPath), outputPath: peManifest,
      extraContext: subtaskTargetsHint(plan), signal,
    })
    pipelineEvent(taskId, "prompt_eng", "done")

    // -------- Stage 4: Executores (em grupos paralelos) --------
    for (let g = 0; g < plan.groups.length; g++) {
      const group = plan.groups[g]
      pipelineEvent(taskId, "exec", "start", { group: g + 1, ids: group })
      await Promise.all(group.map(subId => runSubtask(subId, taskId, project, plan, signal)))
      pipelineEvent(taskId, "exec", "done", { group: g + 1 })
    }

    // -------- Stage 5: QA com fix loop --------
    let approved = false
    let attempt = 0
    const MAX = 2
    while (!approved && attempt <= MAX) {
      pipelineEvent(taskId, "qa", "start", { attempt })
      const qaOut = join(TASKS.done, `${taskId}-qa.md`)
      await callAgent("qa", {
        taskId, project, payload: collectExecReports(plan), outputPath: qaOut,
        extraContext: `attempt: ${attempt}`, signal,
      })
      const verdict = parseQaStatus(read(qaOut))
      pipelineEvent(taskId, "qa", "done", { attempt, verdict })

      if (verdict === "approved") {
        approved = true
        break
      }
      if (attempt >= MAX) break

      // Fix loop: re-roda subtasks problemáticas com o feedback do QA.
      attempt++
      pipelineEvent(taskId, "fix", "start", { attempt })
      const qaContent = read(qaOut)
      const failingIds = extractFailingSubtaskIds(qaContent, plan)
      if (!failingIds.length) {
        log("orchestrator", "[fix] QA reprovou mas nenhuma subtask foi citada — abortando loop", "stderr")
        break
      }
      for (const subId of failingIds) {
        const sub = plan.subtasks.find(s => s.id === subId)
        if (!sub) continue
        await runSubtask(subId, taskId, project, plan, signal, { fixContext: qaContent })
      }
      pipelineEvent(taskId, "fix", "done", { attempt, ids: failingIds })
    }

    if (!approved) {
      const err = `QA não aprovou após ${attempt} tentativa(s). Intervenção humana necessária.`
      write(join(ERRORS, `${taskId}.md`), framedErr(taskId, err))
      pipelineEvent(taskId, "pipeline", "escalated", { reason: err })
      return { taskId, status: "escalated" }
    }

    // -------- Stage 6: Versioner --------
    pipelineEvent(taskId, "versioner", "start")
    // Move arquivo aprovado para qa_approved antes do Versioner agir.
    const approvedPath = join(TASKS.qaApproved, `${taskId}.md`)
    write(approvedPath, read(planPath))
    const versionerOut = join(TASKS.versioned, `${taskId}-manifest.md`)
    await callAgent("versioner", {
      taskId, project, payload: read(approvedPath), outputPath: versionerOut, signal,
    })
    requireFile(versionerOut, "versioner não escreveu manifest")
    pipelineEvent(taskId, "versioner", "done", { manifest: versionerOut })

    pipelineEvent(taskId, "pipeline", "done")
    return { taskId, status: "done", manifest: versionerOut }
  } catch (err) {
    write(join(ERRORS, `${taskId}.md`), framedErr(taskId, err.stack || err.message))
    pipelineEvent(taskId, "pipeline", "error", { message: err.message })
    throw err
  }
}

async function runSubtask(subId, taskId, project, plan, signal, opts = {}) {
  const sub = plan.subtasks.find(s => s.id === subId)
  if (!sub) throw new Error(`subtask não encontrada no plano: ${subId}`)
  const readyPath = join(TASKS.ready, `${subId}.md`)
  const ready = readWithFrontmatter(readyPath)
  const prompt = ready.content || read(readyPath)
  if (!prompt) throw new Error(`prompt do PE ausente para ${subId} em ${readyPath}`)

  const outputPath = ready.data.output_path || join(TASKS.done, `${subId}-${sub.agent}.md`)
  const extra = opts.fixContext
    ? `# [FIX REQUEST — QA REPROVOU]\n${opts.fixContext}\nReexecute corrigindo as issues acima sem regredir o resto.`
    : ""

  await callAgent(sub.agent, {
    taskId, project, payload: prompt, outputPath, extraContext: extra, signal,
  })
}

async function callAgent(agentId, { taskId, project, payload, outputPath, extraContext, signal }) {
  if (!MODEL_MAP[agentId]) throw new Error(`agent não mapeado: ${agentId}`)
  const fullPrompt = buildPrompt({ agentId, taskId, payload, project, outputPath, extraContext })
  await runAgent(agentId, fullPrompt, { signal })
}

function requireFile(path, msg) {
  if (!existsSync(path)) throw new Error(`${msg} (${path})`)
}

function framedRaw(taskId, project, raw) {
  return `---\nid: ${taskId}\nproject: ${project}\nstatus: inbox\ncreated: ${new Date().toISOString()}\n---\n\n${raw}\n`
}

function framedErr(taskId, message) {
  return `---\nid: ${taskId}\nstatus: error\ncreated: ${new Date().toISOString()}\n---\n\n## Erro\n\n\`\`\`\n${message}\n\`\`\`\n`
}

function subtaskTargetsHint(plan) {
  return [
    "# [INSTRUÇÕES PARA O PROMPT ENGINEER]",
    "Escreva um arquivo por subtask. Cada arquivo:",
    "- caminho: vault/tasks/ready/<SUBTASK-ID>.md",
    "- com frontmatter: id, parent, agent, model, status: ready, token_budget, output_path",
    "- corpo: prompt completo a passar pro CLI executor",
    "",
    "Subtasks declaradas no plano:",
    ...plan.subtasks.map(s => `- ${s.id} (agent: ${s.agent}, model: ${s.model}, budget: ${s.token_budget || "?"})`),
  ].join("\n")
}

function collectExecReports(plan) {
  const lines = []
  for (const sub of plan.subtasks) {
    const file = list(TASKS.done).find(p => p.includes(sub.id))
    if (!file) continue
    lines.push(`# ${sub.id} (${sub.agent})`)
    lines.push(read(file))
    lines.push("")
  }
  return lines.join("\n")
}

function extractFailingSubtaskIds(qaContent, plan) {
  const ids = new Set()
  const re = /subtask:\s*([A-Za-z0-9_-]+)/g
  let m
  while ((m = re.exec(qaContent)) !== null) ids.add(m[1])
  // Filtra só ids que existem no plano.
  const valid = plan.subtasks.map(s => s.id)
  return [...ids].filter(id => valid.includes(id))
}
