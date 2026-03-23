import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { parseEnv } from "@platform/env"
import { createLogger, initializeObservability, shutdownObservability } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { runTemporalWorker } from "./temporal/create-worker.ts"

const nodeEnv = process.env.NODE_ENV || "development"
if (import.meta.url) {
  const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
  if (existsSync(envFilePath)) {
    loadDotenv({ path: envFilePath, quiet: true })
  }
}

await initializeObservability({
  serviceName: "workflows",
})

const logger = createLogger("workflows")
let ready = false

const healthPort = Effect.runSync(parseEnv("LAT_WORKFLOWS_HEALTH_PORT", "number", 9091))
const healthServer = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    const status = ready ? 200 : 503
    res.writeHead(status, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: ready ? "ok" : "starting" }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

healthServer.listen(healthPort, () => {
  logger.info(`workflows health check listening on :${healthPort}/health`)
})

const temporalAddress = Effect.runSync(parseEnv("LAT_TEMPORAL_ADDRESS", "string", "localhost:7233"))
const temporalNamespace = Effect.runSync(parseEnv("LAT_TEMPORAL_NAMESPACE", "string", "default"))
const temporalTaskQueue = Effect.runSync(parseEnv("LAT_TEMPORAL_TASK_QUEUE", "string", "latitude-workflows"))

let shutdownTemporal: (() => Promise<void>) | undefined

const start = async () => {
  const temporal = await runTemporalWorker({
    address: temporalAddress,
    namespace: temporalNamespace,
    taskQueue: temporalTaskQueue,
  })

  shutdownTemporal = temporal.shutdown
  ready = true
  logger.info("workflows Temporal worker polling", {
    address: temporalAddress,
    namespace: temporalNamespace,
    taskQueue: temporalTaskQueue,
  })

  await temporal.runPromise
}

const runPromise = start().catch((error) => {
  logger.error("Failed to start workflows worker", error)
  process.exit(1)
})

const handleShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down workflows worker...`)
  ready = false
  healthServer.close()

  try {
    if (shutdownTemporal) {
      await shutdownTemporal()
    } else {
      await runPromise
    }
  } catch (error) {
    logger.error("Error during shutdown (worker may not have started)", error)
  }

  await shutdownObservability()
  process.exit(0)
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"))
process.on("SIGINT", () => handleShutdown("SIGINT"))
