import { OpenAPIHono } from '@hono/zod-openapi'
import { v3Router } from '$/routes/api/v3'
import { v4Router } from '$/routes/api/v4'

export function configureApiRoutes(app: OpenAPIHono) {
  app.route('/', v3Router)
  app.route('/', v4Router)
}
