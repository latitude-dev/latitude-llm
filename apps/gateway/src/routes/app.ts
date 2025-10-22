import { logger } from 'hono/logger'

import authMiddleware from '$/middlewares/auth'
import { rateLimitMiddleware } from '$/middlewares/rateLimit'
import errorHandlerMiddleware from '$/middlewares/errorHandler'
import { inflightRequestsMiddleware } from '$/middlewares/inflightRequests'

import createApp from '$/openApi/createApp'
import configureOpenAPI from '$/openApi/configureOpenAPI'
import { configureApiRoutes } from './api'
import { configureWebhookRoutes } from './webhook'
import { memoryUsageMiddleware } from '$/middlewares/memoryLogger'
import { tracerMiddleware } from '$/middlewares/tracer'
import { env } from '@latitude-data/env'

const app = createApp()

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

if (process.env.NODE_ENV !== 'test') {
  app.use(logger())
  app.use(memoryUsageMiddleware())
}

app.use(tracerMiddleware())

configureOpenAPI(app)
configureWebhookRoutes(app)

app.use(rateLimitMiddleware())
app.use(authMiddleware())

if (env.AWS_ACCESS_KEY && env.AWS_ACCESS_SECRET) {
  app.use(inflightRequestsMiddleware())
}

configureApiRoutes(app)

app.onError(errorHandlerMiddleware)

export default app
