import { logger } from 'hono/logger'

import authMiddleware from '$/middlewares/auth'
import errorHandlerMiddleware from '$/middlewares/errorHandler'
import { rateLimitMiddleware } from '$/middlewares/rateLimit'

import { memoryUsageMiddleware } from '$/middlewares/memoryLogger'
import { tracerMiddleware } from '$/middlewares/tracer'
import configureOpenAPI from '$/openApi/configureOpenAPI'
import createApp from '$/openApi/createApp'
import { configureApiRoutes } from './api'
import { configureWebhookRoutes } from './webhook'

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

configureApiRoutes(app)

app.onError(errorHandlerMiddleware)

export default app
