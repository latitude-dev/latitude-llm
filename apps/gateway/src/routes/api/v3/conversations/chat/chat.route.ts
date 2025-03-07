import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  legacyChainEventDtoSchema,
  internalInfoSchema,
  runSyncAPIResponseSchema,
} from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/api/v3/conversations/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'
import { messageSchema } from '@latitude-data/core/browser'

export const chatRoute = createRoute({
  operationId: 'createChat',
  tags: ['Conversations'],
  method: http.Methods.POST,
  path: ROUTES.api.v3.conversations.chat,
  request: {
    params: conversationsParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: internalInfoSchema.extend({
            messages: z.array(messageSchema),
            stream: z.boolean().default(false),
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
        [http.MediaTypes.JSON]: { schema: runSyncAPIResponseSchema },
        [http.MediaTypes.SSE]: { schema: legacyChainEventDtoSchema },
      },
    },
  },
})

export type ChatRoute = typeof chatRoute
