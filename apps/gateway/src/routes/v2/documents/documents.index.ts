import { createRouter } from '$/openApi/createApp'

import { runHandler, runRoute } from '$/routes/v2/documents/run'
import {
  getOrCreateHandler,
  getOrCreateRoute,
} from '$/routes/v2/documents/getOrCreate'

const router = createRouter()
  .openapi(runRoute, runHandler)
  .openapi(getOrCreateRoute, getOrCreateHandler)

export default router
