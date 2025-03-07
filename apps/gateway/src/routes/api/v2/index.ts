import { createRouter } from '$/openApi/createApp'
import { chatHandler, chatRoute } from './conversations/chat'
import { runHandler, runRoute } from './documents/run'

const router = createRouter()
  .openapi(runRoute, runHandler)
  .openapi(chatRoute, chatHandler)

export default router
