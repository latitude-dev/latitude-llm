import http from 'http'

import { setupWorkers } from '@latitude-data/jobs'

const workers = setupWorkers()

console.log('Workers started')

const port = 3000
const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'OK', message: 'Workers are healthy' }))
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'Not Found' }))
  }
})

server.listen(port, () => {
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
  // TODO: Sentry.captureException(err)

  console.error(err, 'Uncaught exception')
})

process.on('unhandledRejection', (reason, promise) => {
  // TODO: Sentry.captureException(reason)

  console.error({ promise, reason }, 'Unhandled Rejection at: Promise')
})
