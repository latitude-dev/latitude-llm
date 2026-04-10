import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { parseEnv } from "@platform/env"
import { loadTemporalConfig } from "@platform/workflows-temporal"
import { runTemporalWorker } from "@platform/workflows-temporal/worker"
import { createLogger, initializeObservability, shutdownObservability } from "@repo/observability"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import * as activities from "./activities/index.ts"
import { getClickhouseClient } from "./clients.ts"

loadDevelopmentEnvironments(import.meta.url)

const log = createLogger("workflows")

function resolveWorkflowsPath(): string {
  const override = process.env.LAT_TEMPORAL_WORKFLOWS_PATH
  if (override !== undefined && override.length > 0) {
    return override
  }
  const fromPackage = join(process.cwd(), "src", "workflows")
  if (existsSync(fromPackage)) {
    return fromPackage
  }
  const fromRepoRoot = join(process.cwd(), "apps", "workflows", "src", "workflows")
  if (existsSync(fromRepoRoot)) {
    return fromRepoRoot
  }
  return fromPackage
}

const bootstrap = async () => {
  await initializeObservability({
    serviceName: "workflows",
  })

  const logger = log
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

  const config = loadTemporalConfig()
  let shutdownTemporal: (() => Promise<void>) | undefined

  const start = async () => {
    const temporal = await runTemporalWorker({
      config,
      workflowsPath: resolveWorkflowsPath(),
      activities,
    })

    shutdownTemporal = temporal.shutdown
    ready = true
    logger.info("workflows Temporal worker polling", {
      address: config.address,
      namespace: config.namespace,
      taskQueue: config.taskQueue,
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
    await getClickhouseClient().close()
    process.exit(0)
  }

  process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM")
  })
  process.on("SIGINT", () => {
    void handleShutdown("SIGINT")
  })
}

void bootstrap().catch((error) => {
  log.error("Failed to bootstrap workflows worker", error)
  process.exit(1)
})
