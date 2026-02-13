import './workers/utils/tracer' // Has to be the first import

import express from 'express'
import {
  captureException,
  captureMessage,
} from './workers/utils/captureException'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'

import { startWorkers } from './workers'
import { setupSchedules } from './workers/schedule'
import { env } from '@latitude-data/env'
import { queues } from '@latitude-data/core/queues'
import { jobTracker } from './workers/utils/jobTracker'

setupSchedules()

const app = express()
const workers = await startWorkers()

// Initialize job tracker with all queues
const allQueues = await queues()
Object.values(allQueues).forEach((queue) => {
  jobTracker.registerQueue(queue)
})

// Set up Bull Board
const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: Object.values(allQueues).map((q) => new BullMQAdapter(q)),
  serverAdapter,
})

// Basic authentication middleware
const basicAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const auth = req.headers.authorization
  const expectedAuth = `Basic ${Buffer.from(`${env.BULL_ADMIN_USER}:${env.BULL_ADMIN_PASS}`).toString('base64')}`

  if (!auth || auth !== expectedAuth) {
    res.set('WWW-Authenticate', 'Basic realm="Bull Board"')
    return res.status(401).send('Authentication required')
  }

  next()
}

// Mount the Bull Board UI with authentication
app.use('/admin/queues', basicAuth, serverAdapter.getRouter())

// Mount the Bull Board UI
app.use('/admin/queues', serverAdapter.getRouter())

console.log('Workers started')

const port = env.WORKERS_PORT || 3002
const host = env.WORKERS_HOST || '0.0.0.0'

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Workers are healthy' })
})

// Handle 404s
app.use((_req, res) => {
  res.status(404).json({ status: 'Not Found' })
})

const server = app.listen(port, host, () => {
  console.log(`Health check server running on port ${port}`)
})

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, initiating graceful shutdown...`)

  // 1) Stop accepting new jobs
  await Promise.all(workers.map((w) => w.pause()))

  // 2) Get current active jobs count (poll immediately for accuracy)
  const remaining = await jobTracker.getActiveJobsCountNow()
  console.log(`Paused workers. Remaining active jobs: ${remaining}`)

  // 3) Wait for active jobs to complete
  await Promise.all(workers.map((w) => w.close()))

  // 4) Stop job tracker polling and disable scale-in protection
  jobTracker.stopPolling()
  await jobTracker.forceDisableProtection()

  // 5) Close HTTP server and exit
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

process.on('uncaughtException', function (err) {
  captureException(err)
})

process.on('unhandledRejection', (reason: string) => {
  captureMessage(reason, 'error')
})
