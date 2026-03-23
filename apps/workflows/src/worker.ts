import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnv } from "@platform/env"
import { createLogger, initializeObservability, shutdownObservability } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

await initializeObservability({
  serviceName: "workflows",
})

const logger = createLogger("workflows")

logger.info("workflows worker bootstrap")

const handleShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down workflows...`)
  await shutdownObservability()
  process.exit(0)
}

process.on("SIGTERM", () => {
  void handleShutdown("SIGTERM")
})

process.on("SIGINT", () => {
  void handleShutdown("SIGINT")
})
