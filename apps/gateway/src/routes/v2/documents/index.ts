import { createRouter } from '$/openApi/createApp'

import { runHandler, runRoute } from '$/routes/v2/documents/run'
import {
  getOrCreateHandler,
  getOrCreateRoute,
} from '$/routes/v2/documents/getOrCreate'
import { getHandler, getRoute } from '$/routes/v2/documents/get'
import { createLogHandler, createLogRoute } from '$/routes/v2/documents/logs'

const router = createRouter()
  .openapi(runRoute, runHandler)
  .openapi(getOrCreateRoute, getOrCreateHandler)
  .openapi(getRoute, getHandler)
  .openapi(createLogRoute, createLogHandler)

export default router
