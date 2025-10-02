import { conversationsRouter } from '$/routes/api/v3/conversations'
import { projectsRouter } from '$/routes/api/v3/projects'
import { tracesRouter } from '$/routes/api/v3/traces'
import { OpenAPIHono } from '@hono/zod-openapi'
import { toolResultsRouter } from './v3/tools/results'

export function configureApiRoutes(app: OpenAPIHono) {
  // V3
  app.route('/', conversationsRouter)
  app.route('/', projectsRouter)
  app.route('/', tracesRouter)
  app.route('/', toolResultsRouter)
}
