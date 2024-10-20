import ROUTES from '$/common/routes'
import authMiddleware from '$/middlewares/auth'
import errorHandlerMiddleware from '$/middlewares/errorHandler'
import rateLimitMiddleware from '$/middlewares/rateLimit'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import jetPaths from 'jet-paths'

import { chatsRouter as chatsRouterV1 } from './api/v1/conversations/[conversationUuid]'
import { documentsRouter as documentsRouterV1 } from './api/v1/projects/[projectId]/versions/[versionUuid]/documents'
import { chatsRouter as chatsRouterV2 } from './api/v2/conversations/[conversationUuid]'
import { documentsRouter as documentsRouterV2 } from './api/v2/projects/[projectId]/versions/[versionUuid]/documents'

const app = new Hono()

// Middlewares
if (process.env.NODE_ENV !== 'test') {
  app.use(logger())
}

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

app.use(rateLimitMiddleware())
app.use(authMiddleware())

// Routers
app.route(jetPaths(ROUTES).Api.V1.Documents.Base, documentsRouterV1)
app.route(jetPaths(ROUTES).Api.V1.Conversations.Base, chatsRouterV1)
app.route(jetPaths(ROUTES).Api.V2.Documents.Base, documentsRouterV2)
app.route(jetPaths(ROUTES).Api.V2.Conversations.Base, chatsRouterV2)

// Must be the last one!
app.onError(errorHandlerMiddleware)

export default app
