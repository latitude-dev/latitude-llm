import { existsSync } from "node:fs"
import { join } from "node:path"
import { createLogger } from "@repo/observability"
import { NativeConnection, Worker } from "@temporalio/worker"
import * as activities from "../activities/index.ts"

const logger = createLogger("workflows-temporal")

interface TemporalWorkerConfig {
  readonly address: string
  readonly namespace: string
  readonly taskQueue: string
  /** Temporal Cloud: set with TLS. Omit for local docker-compose. */
  readonly apiKey?: string
}

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

const createTemporalWorker = async (config: TemporalWorkerConfig) => {
  const workflowsDir = resolveWorkflowsPath()

  logger.info("connecting to Temporal", {
    address: config.address,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath: workflowsDir,
  })

  const useCloud = config.apiKey !== undefined && config.apiKey.length > 0

  const connection = await NativeConnection.connect({
    address: config.address,
    ...(useCloud ? { tls: true as const, apiKey: config.apiKey } : {}),
  })

  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath: workflowsDir,
    activities,
  })

  return { worker, connection }
}

export const runTemporalWorker = async (config: TemporalWorkerConfig) => {
  const { worker, connection } = await createTemporalWorker(config)

  const runPromise = worker.run()

  return {
    runPromise,
    shutdown: async () => {
      await worker.shutdown()
      await runPromise
      await connection.close()
    },
  }
}
