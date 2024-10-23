import { serve } from '@hono/node-server'
import env from '$/common/env'
import app from '$/routes/app'

import { captureException, captureMessage } from './common/sentry'

serve(
  {
    fetch: app.fetch,
    overrideGlobalObjects: undefined,
    hostname: env.HOSTNAME,
    port: env.PORT,
    serverOptions: {
      keepAliveTimeout: process.env.KEEP_ALIVE_TIMEOUT
        ? Number(process.env.KEEP_ALIVE_TIMEOUT)
        : 121000,
    },
  },
  (info) => {
    console.log(`Listening on http://${env.HOSTNAME}:${info.port}`)
  },
)

function gracefulShutdown() {
  console.log('Received termination signal. Shutting down gracefully...')
  process.exit(0)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

process.on('uncaughtException', function (err) {
  captureException(err)
})

process.on('unhandledRejection', (reason: string) => {
  captureMessage(reason)
})
