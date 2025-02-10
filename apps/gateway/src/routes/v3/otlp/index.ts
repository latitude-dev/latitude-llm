import { createRouter } from '$/openApi/createApp'

import {
  tracesV2Route,
  tracesHandler,
  tracesV3Route,
} from '$/routes/v3/otlp/traces'

const router = createRouter()
  .openapi(tracesV2Route, tracesHandler)
  .openapi(tracesV3Route, tracesHandler)

export default router
