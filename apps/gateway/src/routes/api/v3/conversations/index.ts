import { createRouter } from '$/openApi/createApp'
import { route } from '$/routes/api/helpers'
import { ROUTES } from '$/routes'

import {
  annotateHandler,
  annotateRouteConfig,
} from '$/routes/api/v3/conversations/annotate'
import {
  attachHandler,
  attachRouteConfig,
} from '$/routes/api/v3/conversations/attach'
import {
  chatHandler,
  chatRouteConfig,
} from '$/routes/api/v3/conversations/chat'
import {
  stopHandler,
  stopRouteConfig,
} from '$/routes/api/v3/conversations/stop'
import { getHandler, getRouteConfig } from '$/routes/api/v3/conversations/get'

export const conversationsRouter = createRouter()
  .openapi(
    route(chatRouteConfig, ROUTES.api.v3.conversations.chat),
    chatHandler,
  )
  .openapi(
    route(attachRouteConfig, ROUTES.api.v3.conversations.attach),
    attachHandler,
  )
  .openapi(
    route(stopRouteConfig, ROUTES.api.v3.conversations.stop),
    stopHandler,
  )
  .openapi(
    route(annotateRouteConfig, ROUTES.api.v3.conversations.annotate),
    annotateHandler,
  )
  .openapi(route(getRouteConfig, ROUTES.api.v3.conversations.get), getHandler)
