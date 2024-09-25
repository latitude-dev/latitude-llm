import ROUTES from '$/common/routes'
import authMiddleware from '$/middlewares/auth'
import errorHandlerMiddleware from '$/middlewares/errorHandler'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import jetPaths from 'jet-paths'

import { chatsRouter } from './api/v1/conversations/:conversationUuid'
import { documentsRouter } from './api/v1/projects/:projectId/versions/:versionUuid/documents'

const app = new Hono()

// Middlewares
if (process.env.NODE_ENV !== 'test') {
  app.use(logger())
}

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

app.use(authMiddleware())

// Routers
app.route(jetPaths(ROUTES).Api.V1.Documents.Base, documentsRouter)
app.route(jetPaths(ROUTES).Api.V1.Conversations.Base, chatsRouter)

// Must be the last one!
app.use(errorHandlerMiddleware())

export default app
