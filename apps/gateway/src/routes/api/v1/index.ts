import { createRouter } from '$/openApi/createApp'
import { chatHandler, chatRoute } from '$/routes/api/v1/chat'

import { runRoute, runHandler } from '$/routes/api/v1/run'

const router = createRouter()
  .openapi(runRoute, runHandler)
  .openapi(chatRoute, chatHandler)

export default router
