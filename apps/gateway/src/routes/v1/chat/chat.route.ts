import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { chainEventDtoSchema, internalInfoSchema } from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/v2/conversations/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'
import { messageSchema } from '@latitude-data/core/browser'

export const chatRoute = createRoute({
  operationId: 'createChat',
  tags: ['V1_DEPRECATED'],
  method: http.Methods.POST,
  path: ROUTES.v1.conversations.chat,
  request: {
    params: conversationsParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: internalInfoSchema.extend({
            messages: z.array(messageSchema),
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'Chat was created successfully',
      content: {
        [http.MediaTypes.SSE]: { schema: chainEventDtoSchema },
      },
    },
  },
})

export type ChatRoute = typeof chatRoute
