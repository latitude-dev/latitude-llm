import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { conversationPresenterSchema } from '$/openApi/schemas/conversations'
import { conversationsParamsSchema } from '$/routes/api/v3/conversations/paramsSchema'
import { defineRouteConfig } from '$/routes/api/helpers'

export const getRouteConfig = defineRouteConfig({
  operationId: 'getConversation',
  tags: ['Conversations'],
  description: 'Get a conversation',
  method: http.Methods.GET,
  request: {
    params: conversationsParamsSchema,
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'Conversation was retrieved successfully',
      content: {
        [http.MediaTypes.JSON]: { schema: conversationPresenterSchema },
      },
    },
  },
})

export type GetRoute = typeof getRouteConfig
