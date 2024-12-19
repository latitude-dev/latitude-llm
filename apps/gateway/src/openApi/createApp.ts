import { OpenAPIHono } from '@hono/zod-openapi'
import errorHandlerMiddleware from '$/middlewares/errorHandler'

export function createRouter() {
  return new OpenAPIHono({ strict: false })
}

export default function createApp() {
  const app = new OpenAPIHono({ strict: false })

  app.onError(errorHandlerMiddleware)

  return app
}
