import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createLogger } from "@repo/observability"
import { NativeConnection, Worker } from "@temporalio/worker"
import * as activities from "../activities/index.ts"

const logger = createLogger("workflows-temporal")

interface TemporalWorkerConfig {
  readonly address: string
  readonly namespace: string
  readonly taskQueue: string
}

const workflowsPath = join(dirnameOfModule(), "..", "workflows")

function dirnameOfModule(): string {
  return fileURLToPath(new URL(".", import.meta.url))
}

const createTemporalWorker = async (config: TemporalWorkerConfig) => {
  logger.info("connecting to Temporal", {
    address: config.address,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
  })

  const connection = await NativeConnection.connect({
    address: config.address,
  })

  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath,
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
