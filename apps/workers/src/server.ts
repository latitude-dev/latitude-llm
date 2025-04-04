import './tracer'
import './utils/sentry'
import * as heapdump from 'heapdump'

import express from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import { ExpressAdapter } from '@bull-board/express'

import { captureException, captureMessage } from './utils/sentry'
import { startWorkers, setupSchedules } from './workers'
import { env } from '@latitude-data/env'
import * as queues from '@latitude-data/core/queues'

setupSchedules()

const app = express()
const workers = await startWorkers()

// Set up Bull Board
const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: Object.values(queues).map((q) => new BullMQAdapter(q)),
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

// Memory profiling endpoint
if (env.NODE_ENV === 'development') {
  app.get('/debug/memory', (_req, res) => {
    const filename = `/tmp/heapdump-${Date.now()}.heapsnapshot`
    heapdump.writeSnapshot(filename, (err: Error | null) => {
      if (err) {
        console.error('Error taking heap snapshot:', err)
        return res.status(500).json({ error: 'Failed to take heap snapshot' })
      }
      res.json({ message: `Heap snapshot written to ${filename}` })
    })
  })
}

// Memory usage monitoring
if (env.NODE_ENV === 'development') {
  setInterval(() => {
    const used = process.memoryUsage()
    console.log('Memory Usage:', {
      rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(used.external / 1024 / 1024)}MB`,
    })
  }, 60000) // Log every minute
}

// Handle 404s
app.use((_req, res) => {
  res.status(404).json({ status: 'Not Found' })
})

const server = app.listen(port, host, () => {
  console.log(`Health check server running on port ${port}`)
})

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, closing workers and server...`)

  await Promise.all(Object.values(workers).map((w) => w.close()))

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
