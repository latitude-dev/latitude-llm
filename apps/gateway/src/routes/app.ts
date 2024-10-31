import authMiddleware from '$/middlewares/auth'
import errorHandlerMiddleware from '$/middlewares/errorHandler'
import rateLimitMiddleware from '$/middlewares/rateLimit'
import { Hono } from 'hono'
import { logger } from 'hono/logger'

import { chatsRouter as conversationsRouterV1 } from './api/v1/conversations/[conversationUuid]'
import { documentsRouter as documentsRouterV1 } from './api/v1/projects/[projectId]/versions/[versionUuid]/documents'
import { conversationsRouter as conversationsRouterV2 } from './api/v2/conversations/[conversationUuid]'
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
// v1
app.route(
  '/api/v1/projects/:projectId/versions/:versionUuid/documents',
  documentsRouterV1,
)
app.route('/api/v1/conversations', conversationsRouterV1)

// v2
app.route(
  '/api/v2/projects/:projectId/versions/:versionUuid/documents',
  documentsRouterV2,
)
app.route('/api/v2/conversations', conversationsRouterV2)

app.onError(errorHandlerMiddleware)

export default app
