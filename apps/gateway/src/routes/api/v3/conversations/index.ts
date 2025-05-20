import { createRouter } from '$/openApi/createApp'
import { chatRoute, chatHandler } from './chat'
import { annotateRoute, annotateHandler } from './annotate'
import { evaluateRoute, evaluateHandler } from './evaluate'
import {
  createEvaluationResultRoute,
  createEvaluationResultHandler,
} from './createEvaluationResult'

const router = createRouter()
  .openapi(chatRoute, chatHandler)
  .openapi(annotateRoute, annotateHandler)
  .openapi(evaluateRoute, evaluateHandler)
  .openapi(createEvaluationResultRoute, createEvaluationResultHandler)

export default router
