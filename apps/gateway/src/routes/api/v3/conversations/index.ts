import { createRouter } from '$/openApi/createApp'
import { annotateHandler, annotateRoute } from './annotate'
import { chatHandler, chatRoute } from './chat'

export const conversationsRouter = createRouter()
  .openapi(chatRoute, chatHandler)
  .openapi(annotateRoute, annotateHandler)
