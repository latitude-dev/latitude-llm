import v1Routes from '$/routes/api/v1'
import v2Routes from '$/routes/api/v2'

import documents from '$/routes/api/v3/documents'
import conversations from '$/routes/api/v3/conversations'
import projects from '$/routes/api/v3/projects'
import { OpenAPIHono } from '@hono/zod-openapi'

export function configureApiRoutes(app: OpenAPIHono) {
  app.route('/', v1Routes)
  app.route('/', v2Routes)

  app.route('/', documents)
  app.route('/', conversations)
  app.route('/', projects)
}
