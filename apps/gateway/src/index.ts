import '@latitude-data/env'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import jetPaths from 'jet-paths'

import ROUTES from './common/routes'
import authMiddleware from './middlewares/auth'
import errorHandlerMiddleware from './middlewares/errorHandler'
import { documentsRouter } from './routes/api/v1/projects/:projectId/commits/:commitUuid/documents'

const app = new Hono()

// Middlewares
if (process.env.NODE_ENV !== 'test') {
  app.use(logger())
}
app.use(authMiddleware())

// Routers
app.route(jetPaths(ROUTES).Api.V1.Documents.Base, documentsRouter)

// Must be the last one!
app.use(errorHandlerMiddleware())

serve(
  {
    fetch: app.fetch,
    overrideGlobalObjects: undefined,
    port: parseInt(process.env.GATEWAY_PORT || '4000', 10),
    hostname: process.env.GATEWAY_HOSTNAME || 'localhost',
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`)
  },
)

export default app
