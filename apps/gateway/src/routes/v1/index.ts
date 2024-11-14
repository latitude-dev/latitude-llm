import { createRouter } from '$/openApi/createApp'
import { chatHandler, chatRoute } from '$/routes/v1/chat'

import { runRoute, runHandler } from '$/routes/v1/run'

const router = createRouter()
  .openapi(runRoute, runHandler)
  .openapi(chatRoute, chatHandler)

export default router
