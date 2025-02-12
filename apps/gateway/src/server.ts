import './instrumentation'

import { serve } from '@hono/node-server'
import app from '$/routes/app'

import { captureException, captureMessage } from './common/sentry'

const isProd = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const HOSTNAME = isProd ? '0.0.0.0' : 'localhost'
const PORT = isTest ? 8788 : isProd ? 8080 : 8787

serve(
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
