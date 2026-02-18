import { createRouter } from '$/openApi/createApp'
import { route } from '$/routes/api/helpers'
import { API_ROUTES } from '$/api.routes'

import { clientToolResultRouteConfig } from '$/routes/api/v3/tools/results/route'
import { clientToolResultHandler } from '$/routes/api/v3/tools/results/handler'

export const toolResultsRouter = createRouter().openapi(
  route(clientToolResultRouteConfig, API_ROUTES.v4.tools.results),
  clientToolResultHandler,
)
