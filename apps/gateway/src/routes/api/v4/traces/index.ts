import { createRouter } from '$/openApi/createApp'
import { API_ROUTES } from '$/api.routes'
import { route } from '$/routes/api/helpers'

import { ingestHandler } from '$/routes/api/v3/traces/ingest/ingest.handler'
import { ingestRouteConfig } from '$/routes/api/v3/traces/ingest/ingest.route'

export const tracesRouter = createRouter().openapi(
  route(ingestRouteConfig, API_ROUTES.v4.traces.ingest),
  ingestHandler,
)
