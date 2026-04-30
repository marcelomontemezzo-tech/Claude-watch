import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { connectBus } from "./lib/ws.js"
import AgentTerminal from "./components/AgentTerminal.jsx"
import Timeline from "./components/Timeline.jsx"
import Composer from "./components/Composer.jsx"

const AGENTS = [
  { id: "intake",        label: "Intake",        model: "claude-sonnet-4-6" },
  { id: "orchestrator",  label: "Orchestrator",  model: "claude-sonnet-4-6" },
  { id: "prompt_eng",    label: "Prompt Engineer", model: "claude-sonnet-4-6" },
  { id: "frontend",      label: "Frontend",      model: "claude-opus-4-7"   },
  { id: "backend",       label: "Backend",       model: "codex / gpt"       },
  { id: "qa",            label: "QA",            model: "claude-sonnet-4-6" },
  { id: "versioner",     label: "Versioner",     model: "claude-sonnet-4-6" },
]

const PROJECTS = ["v8milennialsb2bv2", "torque", "copilot", "devtrack"]

const MAX_LINES_PER_AGENT = 800

function logsReducer(state, action) {
  switch (action.type) {
    case "log": {
      const cur = state[action.agent] || []
      const next = cur.concat({ line: action.line, level: action.level })
      if (next.length > MAX_LINES_PER_AGENT) next.splice(0, next.length - MAX_LINES_PER_AGENT)
      return { ...state, [action.agent]: next }
    }
    case "clear":
      return {}
    default: return state
  }
}

function statesReducer(state, action) {
  switch (action.type) {
    case "set":
      return { ...state, [action.agent]: action.state }
    case "clear": return {}
    default: return state
  }
}

export default function App() {
  const [project, setProject] = useState("torque")
  const [conn, setConn] = useState("connecting")
  const [logs, dispatchLogs] = useReducer(logsReducer, {})
  const [agentStates, dispatchStates] = useReducer(statesReducer, {})
  const [pipeline, setPipeline] = useState([])  // [{ stage, state, ts, meta }]
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
    const close = connectBus({
      url,
      onState: setConn,
      onEvent: msg => {
        if (msg.type === "log") {
          dispatchLogs({ type: "log", agent: msg.agent, line: msg.line, level: msg.level })
        } else if (msg.type === "status") {
          dispatchStates({ type: "set", agent: msg.agent, state: msg.state })
        } else if (msg.type === "pipeline") {
          setPipeline(p => p.concat({ stage: msg.stage, state: msg.state, ts: msg.ts, meta: msg }))
          if (msg.stage === "pipeline" && (msg.state === "done" || msg.state === "error" || msg.state === "escalated")) {
            setSubmitting(false)
            showToast(
              msg.state === "done"      ? "Pipeline concluído"
              : msg.state === "escalated" ? "Pipeline escalado para humano"
              : `Pipeline falhou: ${msg.message || ""}`
            )
          }
        }
      },
    })
    return close
  }, [])

  const showToast = (text) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const submit = async (taskText) => {
    if (!taskText.trim() || submitting) return
    setSubmitting(true)
    dispatchLogs({ type: "clear" })
    dispatchStates({ type: "clear" })
    setPipeline([])
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskText, project }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      setSubmitting(false)
      showToast(`Falha ao enviar: ${e.message}`)
    }
  }

  const visibleAgents = useMemo(() => AGENTS, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <span className="name">Milennials</span>
          <span className="sep">·</span>
          <span className="product">Agent Runner</span>
        </div>
        <div className="spacer" />
        <div className="project-pill" title="Projeto-alvo">
          <span>projeto</span>
          <select value={project} onChange={e => setProject(e.target.value)} disabled={submitting}>
            {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="conn" data-state={conn} title={`WS: ${conn}`}>
          <span className="lamp" />
          <span>{conn === "open" ? "online" : conn === "closed" ? "offline" : "conectando"}</span>
        </div>
      </header>

      <main className="main">
        <aside className="left">
          <Composer onSubmit={submit} submitting={submitting} />
          <Timeline events={pipeline} />
        </aside>

        <section className="right">
          <h2>Agents</h2>
          <div className="terminals">
            {visibleAgents.map(a => (
              <AgentTerminal
                key={a.id}
                agent={a}
                state={agentStates[a.id]}
                lines={logs[a.id]}
              />
            ))}
          </div>
        </section>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
