import { logger } from 'hono/logger'

import authMiddleware from '$/middlewares/auth'
import rateLimitMiddleware from '$/middlewares/rateLimit'
import errorHandlerMiddleware from '$/middlewares/errorHandler'

import createApp from '$/openApi/createApp'
import configureOpenAPI from '$/openApi/configureOpenAPI'
import { configureApiRoutes } from './api'
import { configureWebhookRoutes } from './webhook'
import * as Sentry from '@sentry/cloudflare'
import { env } from '@latitude-data/env'

const app = createApp()

if (process.env.NODE_ENV !== 'test') {
  app.use(logger())
}

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

configureOpenAPI(app)

// Middlewares
app.use(rateLimitMiddleware())
configureWebhookRoutes(app)

app.use(authMiddleware())

// Routes
configureApiRoutes(app)

app.onError(errorHandlerMiddleware)

export default Sentry.withSentry(
  () => ({
    dsn: env.SENTRY_GATEWAY_DSN,
    sendDefaultPii: true, // Adds request headers and IP for users, for more info visit:
    tracesSampleRate: 1.0,
  }),
  app,
)
