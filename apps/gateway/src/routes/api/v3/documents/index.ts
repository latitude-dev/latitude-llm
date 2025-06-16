import { createRouter } from '$/openApi/createApp'

import { runHandler, runRoute } from '$/routes/api/v3/documents/run'
import {
  getOrCreateHandler,
  getOrCreateRouteV3,
} from '$/routes/api/v3/documents/getOrCreate'
import { getHandler, getRouteV3 } from '$/routes/api/v3/documents/get'
import { getAllHandler, getAllRoute } from '$/routes/api/v3/documents/getAll'
import {
  createLogHandler,
  createLogRouteV3,
} from '$/routes/api/v3/documents/logs'

const router = createRouter()
  .openapi(createLogRouteV3, createLogHandler)
  .openapi(getAllRoute, getAllHandler)
  .openapi(getOrCreateRouteV3, getOrCreateHandler)
  .openapi(getRouteV3, getHandler)
  .openapi(runRoute, runHandler)

export default router
