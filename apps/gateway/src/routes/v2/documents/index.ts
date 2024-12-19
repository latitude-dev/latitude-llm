import { createRouter } from '$/openApi/createApp'

import { runHandler, runRoute } from '$/routes/v2/documents/run'
import {
  getOrCreateHandler,
  getOrCreateRoute,
} from '$/routes/v2/documents/getOrCreate'
import { getHandler, getRouteV1, getRouteV2 } from '$/routes/v2/documents/get'
import {
  createLogHandler,
  createLogRouteV1,
  createLogRouteV2,
} from '$/routes/v2/documents/logs'

const router = createRouter()
  .openapi(runRoute, runHandler)
  .openapi(getOrCreateRoute, getOrCreateHandler)
  .openapi(getRouteV1, getHandler)
  .openapi(getRouteV2, getHandler)
  .openapi(createLogRouteV1, createLogHandler)
  .openapi(createLogRouteV2, createLogHandler)

export default router
