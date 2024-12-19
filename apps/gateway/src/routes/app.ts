import { logger } from 'hono/logger'

import authMiddleware from '$/middlewares/auth'
import rateLimitMiddleware from '$/middlewares/rateLimit'

import createApp from '$/openApi/createApp'
import configureOpenAPI from '$/openApi/configureOpenAPI'

// Routes
import documents from '$/routes/v2/documents/documents.index'

const ROUTES = [documents] as const

const app = createApp()

// Middlewares
if (process.env.NODE_ENV !== 'test') {
  app.use(logger())
}

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

configureOpenAPI(app)

app.use(rateLimitMiddleware())

app.use(authMiddleware())

/* app.route( */
/*   '/api/v1/projects/:projectId/versions/:versionUuid/documents', */
/*   documentsRouterV1, */
/* ) */
/* app.route('/api/v1/conversations', conversationsRouterV1) */
/* app.route( */
/*   '/api/v2/projects/:projectId/versions/:versionUuid/documents', */
/*   documentsRouterV2, */
/* ) */
/* app.route('/api/v2/conversations', conversationsRouterV2) */
/* app.route('/api/v2/otlp', otlpTracesRouter) */


ROUTES.forEach((route) => {
  app.route('/', route)
})

export default app
