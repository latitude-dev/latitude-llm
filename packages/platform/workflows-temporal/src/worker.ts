import { createLogger } from "@repo/observability"
import { NativeConnection, Worker } from "@temporalio/worker"
import type { TemporalConfig } from "./config.ts"

const logger = createLogger("workflows-temporal-worker")

export interface RunTemporalWorkerInput {
  readonly config: TemporalConfig
  readonly workflowsPath: string
  readonly activities: Record<string, (...args: never[]) => unknown>
}

export async function runTemporalWorker(input: RunTemporalWorkerInput) {
  const { config, workflowsPath, activities } = input

  logger.info("connecting Temporal worker", {
    address: config.address,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath,
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
    workflowsPath,
    activities,
  })

  const runPromise = worker.run()

  return {
    runPromise,
    shutdown: async () => {
      worker.shutdown()
      await runPromise
      await connection.close()
    },
  }
}
