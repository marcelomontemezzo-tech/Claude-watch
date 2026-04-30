// Roda o pipeline direto no terminal, sem WS, sem frontend.
// Uso: node src/cli.js "descrição da task" [project]
import { runPipeline } from "./orchestrate.js"

const [, , taskArg, projectArg] = process.argv
if (!taskArg) {
  console.error("uso: node src/cli.js \"descrição da task\" [project]")
  process.exit(1)
}

runPipeline({ taskRaw: taskArg, project: projectArg || "torque" })
  .then(r => { console.log("OK", r); process.exit(0) })
  .catch(e => { console.error("FAIL", e); process.exit(1) })
