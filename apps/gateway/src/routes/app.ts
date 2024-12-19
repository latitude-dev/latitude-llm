import { OpenAPIHono } from '@hono/zod-openapi'
import authMiddleware from '$/middlewares/auth'
import errorHandlerMiddleware from '$/middlewares/errorHandler'
import rateLimitMiddleware from '$/middlewares/rateLimit'
import { logger } from 'hono/logger'

import { chatsRouter as conversationsRouterV1 } from './api/v1/conversations/[conversationUuid]'
import { documentsRouter as documentsRouterV1 } from './api/v1/projects/[projectId]/versions/[versionUuid]/documents'
import { conversationsRouter as conversationsRouterV2 } from './api/v2/conversations/[conversationUuid]'
import { otlpTracesRouter } from './api/v2/otlp/traces'
import { documentsRouter as documentsRouterV2 } from './api/v2/projects/[projectId]/versions/[versionUuid]/documents'

const app = new OpenAPIHono()

// Middlewares
if (process.env.NODE_ENV !== 'test') {
  app.use(logger())
}

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

app
  .doc('/doc', (c) => ({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'Latitude',
    },
    externalDocs: {
      url: 'https://docs.latitude.so',
      description: 'Latitude Documentation',
    },
    servers: [
      {
        url: new URL(c.req.url).origin,
        description: 'Current environment',
      },
    ],
    security: [{ Auth: [] }],
  }))
  .openAPIRegistry.registerComponent('securitySchemes', 'Auth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'token',
    description: 'Latitude API Key',
  })

if (process.env.NODE_ENV === 'development') {
  const { swaggerUI } = await import('@hono/swagger-ui')
  app.get('/ui', swaggerUI({ url: '/doc' }))
}

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
app.route('/api/v2/otlp', otlpTracesRouter)

app.onError(errorHandlerMiddleware)

export default app
