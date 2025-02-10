import { createRouter } from '$/openApi/createApp'
import { chatRoute, chatHandler } from './chat'
import {
  createEvaluationResultHandler,
  createEvaluationResultV2Route,
  createEvaluationResultV3Route,
} from './createEvaluationResult'
import { evaluateHandler, evaluateV2Route, evaluateV3Route } from './evaluate'

const router = createRouter()
  .openapi(chatRoute, chatHandler)
  .openapi(evaluateV2Route, evaluateHandler)
  .openapi(evaluateV3Route, evaluateHandler)
  .openapi(createEvaluationResultV2Route, createEvaluationResultHandler)
  .openapi(createEvaluationResultV3Route, createEvaluationResultHandler)

export default router
