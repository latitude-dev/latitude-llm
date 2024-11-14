import { createRouter } from '$/openApi/createApp'

import { tracesRoute, tracesHandler } from '$/routes/v2/otlp/traces'

const router = createRouter().openapi(tracesRoute, tracesHandler)

export default router
