import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  internalInfoSchema,
  legacyChainEventDtoSchema,
  runSyncAPIResponseSchema,
  messageSchema,
} from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/api/v3/conversations/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

export const chatRoute = createRoute({
  operationId: 'createChat',
  tags: ['Conversations'],
  description: 'Chat with an existing conversation',
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
            tools: z.array(z.string()).optional().default([]),
            mcpHeaders: z
              .record(z.string(), z.record(z.string(), z.string()))
              .optional(),
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
