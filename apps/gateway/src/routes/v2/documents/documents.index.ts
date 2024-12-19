import { createRouter } from '$/openApi/createApp'
import { runHandler } from '$/routes/v2/documents/run/run.handler'
import { runRoute } from '$/routes/v2/documents/run/run.route'

const router = createRouter().openapi(runRoute, runHandler)

export default router
