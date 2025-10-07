import { captureException } from './common/tracer'

import { serve, ServerType } from '@hono/node-server'
import app from '$/routes/app'
import cluster from 'cluster'
import os from 'os'

import { env } from '@latitude-data/env'

const HOSTNAME = env.GATEWAY_BIND_ADDRESS
const PORT = env.GATEWAY_BIND_PORT
const SHUTDOWN_TIMEOUT = 600000 // 10 minutes
const WORKERS = env.GATEWAY_WORKERS
  ? env.GATEWAY_WORKERS
  : env.NODE_ENV === 'production'
    ? os.cpus().length
    : 1

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`)
  console.log(`Starting ${WORKERS} workers...`)

  // Fork workers
  for (let i = 0; i < WORKERS; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`)
    cluster.fork()
  })

  process.on('SIGTERM', () => {
    console.log('Primary received SIGTERM. Shutting down workers...')
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill()
    }
    process.exit(0)
  })

  process.on('SIGINT', () => {
    console.log('Primary received SIGINT. Shutting down workers...')
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill()
    }
    process.exit(0)
  })
} else {
  const server = serve(
    {
      fetch: app.fetch,
      overrideGlobalObjects: undefined,
      hostname: HOSTNAME,
      port: Number(PORT),
      serverOptions: {
        keepAliveTimeout: env.KEEP_ALIVE_TIMEOUT,
      },
    },
    () => {
      console.log(
        `Worker ${process.pid} listening on http://${HOSTNAME}:${PORT}`,
      )
    },
  )

  process.on('SIGTERM', () => gracefulShutdown(server))
  process.on('SIGINT', () => gracefulShutdown(server))

  process.on('uncaughtException', function (err) {
    captureException(err)
  })
}

function gracefulShutdown(server: ServerType) {
  server.close(() => {
    console.log(`Worker ${process.pid} shutting down gracefully...`)
    process.exit(0)
  })

  setTimeout(() => {
    console.error(
      `Worker ${process.pid} forcing shutdown due to pending connections.`,
    )
    process.exit(1)
  }, SHUTDOWN_TIMEOUT)
}
