import { createRouter } from '$/openApi/createApp'

import { runHandler, runRoute } from '$/routes/v3/documents/run'
import {
  getOrCreateHandler,
  getOrCreateRouteV2,
  getOrCreateRouteV3,
} from '$/routes/v3/documents/getOrCreate'
import {
  getHandler,
  getRouteV1,
  getRouteV2,
  getRouteV3,
} from '$/routes/v3/documents/get'
import {
  createLogHandler,
  createLogRouteV1,
  createLogRouteV2,
  createLogRouteV3,
} from '$/routes/v3/documents/logs'

const router = createRouter()
  .openapi(runRoute, runHandler)
  .openapi(getOrCreateRouteV2, getOrCreateHandler)
  .openapi(getOrCreateRouteV3, getOrCreateHandler)
  .openapi(getRouteV1, getHandler)
  .openapi(getRouteV2, getHandler)
  .openapi(getRouteV3, getHandler)
  .openapi(createLogRouteV1, createLogHandler)
  .openapi(createLogRouteV2, createLogHandler)
  .openapi(createLogRouteV3, createLogHandler)

export default router
