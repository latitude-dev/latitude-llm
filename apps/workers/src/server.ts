import './tracer'

import express from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import { ExpressAdapter } from '@bull-board/express'
import { setupQueues } from '@latitude-data/core/jobs'

import { captureException, captureMessage } from './utils/sentry'
import startWorkers from './workers'
import { env } from '@latitude-data/env'

const queues = await setupQueues()
const app = express()
const workers = await startWorkers()

// Set up Bull Board
const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: Object.values(queues).map((q) => new BullMQAdapter(q.queue)),
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
const host = env.WORKERS_HOST || 'localhost'

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
  console.log(`Received ${signal}, closing workers and server...`)

  await Promise.all(workers.map((w) => w.close()))

  server.close(() => process.exit(0))
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

process.on('uncaughtException', function (err) {
  captureException(err)
})

process.on('unhandledRejection', (reason: string) => {
  captureMessage(reason)
})
