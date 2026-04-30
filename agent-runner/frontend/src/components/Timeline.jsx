const STAGE_LABEL = {
  init: "Inicialização",
  intake: "Intake",
  orchestrator: "Orchestrator",
  prompt_eng: "Prompt Engineer",
  exec: "Execução",
  qa: "QA",
  fix: "Fix loop",
  versioner: "Versioner",
  pipeline: "Pipeline",
}

function shortMeta(ev) {
  if (ev.stage === "exec" && ev.meta?.ids) return `grupo ${ev.meta.group} · ${ev.meta.ids.length} subtask${ev.meta.ids.length > 1 ? "s" : ""}`
  if (ev.stage === "qa")  return ev.meta?.verdict ? ev.meta.verdict : `tentativa ${ev.meta?.attempt ?? 0}`
  if (ev.stage === "fix") return `tentativa ${ev.meta?.attempt ?? 0}`
  if (ev.stage === "orchestrator" && ev.meta?.subtasks) return `${ev.meta.subtasks} subtasks · ${ev.meta.groups} grupos`
  if (ev.stage === "pipeline" && ev.meta?.message) return ev.meta.message
  return ""
}

export default function Timeline({ events }) {
  return (
    <div className="timeline">
      <h2>Pipeline</h2>
      {events.length === 0 ? (
        <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "8px 2px" }}>
          Nenhum pipeline rodando. Envie uma task para começar.
        </p>
      ) : (
        <ul>
          {events.map((ev, i) => (
            <li key={i} className="tl-item" data-state={ev.state}>
              <span className="pip" />
              <span className="label">
                {STAGE_LABEL[ev.stage] || ev.stage} · <span style={{ color: "var(--ink-2)", fontWeight: 400 }}>{ev.state}</span>
              </span>
              <span className="meta">{shortMeta(ev)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
