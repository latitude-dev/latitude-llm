import { conversationsRouter } from '$/routes/api/v3/conversations'
import { projectsRouter } from '$/routes/api/v3/projects'
import { OpenAPIHono } from '@hono/zod-openapi'
import { default as v1Routes } from '$/routes/api/v1'
import { default as v2Routes } from '$/routes/api/v2'

export function configureApiRoutes(app: OpenAPIHono) {
  // Deprecated
  app.route('/', v1Routes)
  app.route('/', v2Routes)

  // V3
  app.route('/', conversationsRouter)
  app.route('/', projectsRouter)
}
