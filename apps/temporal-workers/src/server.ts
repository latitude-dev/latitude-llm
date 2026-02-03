import {
  Worker,
  bundleWorkflowCode,
  NativeConnection,
} from '@temporalio/worker'
import { env } from '@latitude-data/env'
import { getConnectionOptions } from '@latitude-data/core/temporal/connection-client'
import {
  getWorkerConnection,
  closeWorkerConnection,
} from '@latitude-data/core/temporal/connection-worker'
import {
  TEMPORAL_QUEUES,
  TemporalQueue,
  QueueConfig,
} from '@latitude-data/core/temporal/queues'
import express from 'express'
import { fileURLToPath } from 'url'

import * as activities from '@latitude-data/core/temporal/activities/handlers'

async function createWorker(
  connection: NativeConnection,
  namespace: string,
  workflowBundle: Awaited<ReturnType<typeof bundleWorkflowCode>>,
  taskQueue: TemporalQueue,
  config: QueueConfig,
): Promise<Worker> {
  return Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowBundle,
    activities,
    maxConcurrentActivityTaskExecutions: config.maxConcurrentActivities,
    maxConcurrentWorkflowTaskExecutions: config.maxConcurrentWorkflows,
  })
}

async function createWorkers(): Promise<Worker[]> {
  const connection = await getWorkerConnection()
  const options = getConnectionOptions()

  const workflowsUrl = import.meta.resolve(
    '@latitude-data/core/temporal/workflows',
  )
  const workflowsPath = fileURLToPath(workflowsUrl)

  const workflowBundle = await bundleWorkflowCode({
    workflowsPath,
  })

  const workers = await Promise.all(
    Object.entries(TEMPORAL_QUEUES).map(([taskQueue, config]) =>
      createWorker(
        connection,
        options.namespace,
        workflowBundle,
        taskQueue as TemporalQueue,
        config,
      ),
    ),
  )

  return workers
}

async function main() {
  const app = express()
  const port = env.TEMPORAL_WORKERS_PORT || 3003
  const host = env.TEMPORAL_WORKERS_HOST || 'localhost'

  app.get('/health', (_req, res) => {
    res.json({ status: 'OK', message: 'Temporal workers healthy' })
  })

  app.use((_req, res) => {
    res.status(404).json({ status: 'Not Found' })
  })

  const server = app.listen(port, host, () => {
    console.log(`Temporal worker health check on port ${port}`)
  })

  const workers = await createWorkers()
  console.log(
    `Started ${workers.length} Temporal workers for queues: ${Object.keys(TEMPORAL_QUEUES).join(', ')}`,
  )

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down Temporal workers...`)

    await Promise.all(workers.map((w) => w.shutdown()))
    await closeWorkerConnection()

    server.close(() => process.exit(0))
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err)
  })

  process.on('unhandledRejection', (reason: string) => {
    console.error('Unhandled rejection:', reason)
  })

  await Promise.all(workers.map((w) => w.run()))
}

main().catch((err) => {
  console.error('Temporal worker failed to start:', err)
  process.exit(1)
})
