import { createRouter } from '$/openApi/createApp'
import { chatRoute, chatHandler } from './chat'
import { annotateRoute, annotateHandler } from './annotate'

export const conversationsRouter = createRouter()
  .openapi(chatRoute, chatHandler)
  .openapi(annotateRoute, annotateHandler)
