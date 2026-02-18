import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'
import { conversationsParamsSchema } from '$/routes/api/v3/conversations/paramsSchema'

export const stopRouteConfig = defineRouteConfig({
  operationId: 'stopConversation',
  tags: ['Conversations'],
  description: 'Stop an active conversation',
  method: http.Methods.POST,
  request: {
    params: conversationsParamsSchema,
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'Conversation was stopped successfully',
    },
  },
})

export type StopRoute = typeof stopRouteConfig
