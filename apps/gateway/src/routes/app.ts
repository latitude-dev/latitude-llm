import { logger } from 'hono/logger'

import authMiddleware from '$/middlewares/auth'
import { rateLimitMiddleware } from '$/middlewares/rateLimit'
import errorHandlerMiddleware from '$/middlewares/errorHandler'

import createApp from '$/openApi/createApp'
import configureOpenAPI from '$/openApi/configureOpenAPI'
import { configureApiRoutes } from './api'
import { configureWebhookRoutes } from './webhook'
import { tracerMiddleware } from '$/middlewares/tracer'

const app = createApp()

if (process.env.NODE_ENV !== 'test') {
  app.use(logger())
}

app.use(tracerMiddleware())

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

configureOpenAPI(app)

app.use(rateLimitMiddleware())

configureWebhookRoutes(app)

app.use(authMiddleware())

configureApiRoutes(app)

app.onError(errorHandlerMiddleware)

export default app
