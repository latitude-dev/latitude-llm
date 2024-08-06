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

export default app
