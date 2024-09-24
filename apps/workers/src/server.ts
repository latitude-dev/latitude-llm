import http from 'http'

import { WebsocketClient } from '@latitude-data/core/websockets/workers'

import { captureException, captureMessage } from './utils/sentry'
import startWorkers from './workers'

const workers = await startWorkers()

console.log('Workers started')

const port = process.env.WORKERS_PORT || 3002
const server = http.createServer(async (req, res) => {
  const websockets = await WebsocketClient.getSocket()

  if (req.url === '/ping' && req.method === 'GET') {
    websockets.emit('pingFromWorkers')
    res.end(JSON.stringify({ status: 'OK', message: 'Pong' }))
  } else if (req.url === '/health' && req.method === 'GET') {
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
  captureException(err)

  console.error(err, 'Uncaught exception')
})

process.on('unhandledRejection', (reason: string, promise) => {
  captureMessage(reason)

  console.error({ promise, reason }, 'Unhandled Rejection at: Promise')
})
