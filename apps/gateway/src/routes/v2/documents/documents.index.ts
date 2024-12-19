import { createRouter } from '$/openApi/createApp'

import { runHandler, runRoute } from '$/routes/v2/documents/run'

const router = createRouter().openapi(runRoute, runHandler)

export default router
