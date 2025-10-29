import { createRouter } from '$/openApi/createApp'
import { annotateHandler, annotateRoute } from './annotate'
import { attachHandler, attachRoute } from './attach'
import { chatHandler, chatRoute } from './chat'
import { stopHandler, stopRoute } from './stop'
import { getHandler, getRoute } from './get'

export const conversationsRouter = createRouter()
  .openapi(chatRoute, chatHandler)
  .openapi(attachRoute, attachHandler)
  .openapi(stopRoute, stopHandler)
  .openapi(annotateRoute, annotateHandler)
  .openapi(getRoute, getHandler)
