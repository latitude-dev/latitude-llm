import { createRouter } from '$/openApi/createApp'

import { chatRoute, chatHandler } from '$/routes/v2/conversations/chat'
import {
  evaluateHandler,
  evaluateRoute,
} from '$/routes/v2/conversations/evaluate'

const router = createRouter()
  .openapi(chatRoute, chatHandler)
  .openapi(evaluateRoute, evaluateHandler)

export default router
