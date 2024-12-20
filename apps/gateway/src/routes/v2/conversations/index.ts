import { createRouter } from '$/openApi/createApp'

import { chatRoute, chatHandler } from '$/routes/v2/conversations/chat'
import {
  createEvaluationResultHandler,
  createEvaluationResultRoute,
} from '$/routes/v2/conversations/createEvaluationResult'
import {
  evaluateHandler,
  evaluateRoute,
} from '$/routes/v2/conversations/evaluate'

const router = createRouter()
  .openapi(chatRoute, chatHandler)
  .openapi(evaluateRoute, evaluateHandler)
  .openapi(createEvaluationResultRoute, createEvaluationResultHandler)

export default router
