import { logger } from 'hono/logger'

import authMiddleware from '$/middlewares/auth'
import rateLimitMiddleware from '$/middlewares/rateLimit'
import errorHandlerMiddleware from '$/middlewares/errorHandler'

import createApp from '$/openApi/createApp'
import configureOpenAPI from '$/openApi/configureOpenAPI'

import v1Routes from '$/routes/v1'
import v2Routes from '$/routes/v2'

import documents from '$/routes/v3/documents'
import conversations from '$/routes/v3/conversations'
import telemetry from '$/routes/v3/otlp'

const app = createApp()

if (process.env.NODE_ENV !== 'test') {
  app.use('*', async (c, next) => {
    if (!c.req.path.match(/^\/(health|api-docs|doc)$/)) {
      logger()(c, next)
    } else {
      await next()
    }
  })
}

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

configureOpenAPI(app)

// Middlewares
app.use(rateLimitMiddleware())
app.use(authMiddleware())

app.route('/', v1Routes)
app.route('/', v2Routes)

app.route('/', documents)
app.route('/', conversations)
app.route('/', telemetry)

app.onError(errorHandlerMiddleware)

export default app
