import { serve } from '@hono/node-server'
import env from '$/common/env'
import app from '$/routes/app'

serve(
  {
    fetch: app.fetch,
    overrideGlobalObjects: undefined,
    hostname: env.HOSTNAME,
    port: env.PORT,
  },
  (info) => {
    console.log(`Listening on http://${env.HOSTNAME}:${info.port}`)
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
