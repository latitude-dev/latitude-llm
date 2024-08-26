import { serve } from '@hono/node-server'
import env from '$/common/env'
import app from '$/routes/app'

serve(
  {
    fetch: app.fetch,
    overrideGlobalObjects: undefined,
    port: env.GATEWAY_PORT,
    hostname: env.GATEWAY_HOSTNAME,
  },
  (info) => {
    console.log(`Listening on http://${env.GATEWAY_HOSTNAME}:${info.port}`)
  },
)

// Add graceful shutdown handler
function gracefulShutdown() {
  console.log('Received termination signal. Shutting down gracefully...')
  // Perform any cleanup operations here
  process.exit(0)
}

// Register signal handlers
process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
