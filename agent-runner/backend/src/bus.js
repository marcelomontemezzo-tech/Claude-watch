import { WebSocketServer } from "ws"

const subscribers = new Set()
let wss = null

export function attachWs(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" })
  wss.on("connection", ws => {
    subscribers.add(ws)
    ws.on("close", () => subscribers.delete(ws))
    ws.on("error", () => subscribers.delete(ws))
    ws.send(JSON.stringify({ type: "hello", ts: Date.now() }))
  })
  return wss
}

export function emit(event) {
  const payload = JSON.stringify({ ts: Date.now(), ...event })
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(payload)
  }
}

export function log(agent, line, type = "stdout") {
  emit({ type: "log", agent, level: type, line })
}

export function status(agent, state, meta = {}) {
  emit({ type: "status", agent, state, ...meta })
}

export function pipelineEvent(taskId, stage, state, meta = {}) {
  emit({ type: "pipeline", taskId, stage, state, ...meta })
}
