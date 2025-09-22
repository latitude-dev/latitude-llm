import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/api/v3/conversations/paramsSchema'
import { createRoute } from '@hono/zod-openapi'

export const stopRoute = createRoute({
  operationId: 'stopConversation',
  tags: ['Conversations'],
  description: 'Stop an active conversation',
  method: http.Methods.POST,
  path: ROUTES.api.v3.conversations.stop,
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

export type StopRoute = typeof stopRoute
