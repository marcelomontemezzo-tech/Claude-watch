import express from "express"
import cors from "cors"
import { createServer } from "node:http"
import { attachWs, log } from "./bus.js"
import { runPipeline } from "./orchestrate.js"

const app = express()
app.use(cors())
app.use(express.json({ limit: "1mb" }))

const PORT = parseInt(process.env.PORT || "5174", 10)

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }))

app.post("/tasks", async (req, res) => {
  const { task, project } = req.body || {}
  if (!task || typeof task !== "string") {
    return res.status(400).json({ error: "campo 'task' (string) é obrigatório" })
  }
  res.status(202).json({ accepted: true })
  // Dispara pipeline em background; eventos vão pelo WS.
  runPipeline({ taskRaw: task, project }).catch(err => {
    log("orchestrator", `[pipeline error] ${err.message}`, "stderr")
  })
})

const httpServer = createServer(app)
attachWs(httpServer)

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`milennials backend em http://localhost:${PORT}  (ws: /ws)`)
})
