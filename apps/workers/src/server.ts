import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { config as loadDotenv } from "dotenv"
import { createWorkersRuntime } from "./runtime.ts"

const nodeEnv = process.env.NODE_ENV || "development"
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const runtime = createWorkersRuntime()

runtime.eventsWorker.on("ready", runtime.onReady)

process.on("SIGINT", async () => {
  await runtime.stop()
  process.exit(0)
})
