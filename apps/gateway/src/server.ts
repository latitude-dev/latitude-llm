import { serve } from '@hono/node-server'
import app from '$/routes/app'

import { env } from '@latitude-data/env'

const HOSTNAME = env.GATEWAY_BIND_ADDRESS
const PORT = env.GATEWAY_BIND_PORT
const SHUTDOWN_TIMEOUT = 600000 // 10 minutes

const server = serve(
  {
    fetch: app.fetch,
    overrideGlobalObjects: undefined,
    hostname: HOSTNAME,
    port: Number(PORT),
    serverOptions: {
      keepAliveTimeout: process.env.KEEP_ALIVE_TIMEOUT
        ? Number(process.env.KEEP_ALIVE_TIMEOUT)
        : 601000,
    },
  },
  () => {
    console.log(`Listening on http://${HOSTNAME}:${PORT}`)
  },
)

function gracefulShutdown() {
  server.close(() => {
    console.log('Received termination signal. Shutting down gracefully...')
    process.exit(0)
  })

  setTimeout(() => {
    console.error('Forcing shutdown due to pending connections.')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
