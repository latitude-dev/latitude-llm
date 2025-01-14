import { createRouter } from '$/openApi/createApp'

import { chatRoute, chatHandler } from '$/routes/v2/conversations/chat'
import { resumeRoute, resumeHandler } from '$/routes/v2/conversations/resume'
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
  .openapi(resumeRoute, resumeHandler)

export default router
