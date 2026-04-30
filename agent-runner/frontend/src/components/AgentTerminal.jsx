import { useEffect, useRef } from "react"

const STATE_LABEL = {
  running: "rodando",
  done: "concluído",
  error: "erro",
}

export default function AgentTerminal({ agent, state, lines }) {
  const bodyRef = useRef(null)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    // Auto-scroll só se já estiver perto do final.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <article className="term">
      <header className="term-head">
        <span className="name">{agent.label}</span>
        <span className="model">{agent.model}</span>
        <span className="state" data-s={state || "idle"}>
          {state ? (STATE_LABEL[state] || state) : "ocioso"}
        </span>
      </header>
      <div className="term-body" ref={bodyRef}>
        {(!lines || lines.length === 0)
          ? <span className="empty">aguardando output…</span>
          : lines.map((l, i) => (
              <span key={i} className={`ln${l.level === "stderr" ? " err" : ""}`}>{l.line}</span>
            ))}
      </div>
    </article>
  )
}
