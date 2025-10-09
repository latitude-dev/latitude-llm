import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  legacyChainEventDtoSchema,
  runSyncAPIResponseSchema,
} from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/api/v3/conversations/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

export const attachRoute = createRoute({
  operationId: 'attachConversation',
  tags: ['Conversations'],
  description: 'Attach to an active conversation',
  method: http.Methods.POST,
  path: ROUTES.api.v3.conversations.attach,
  request: {
    params: conversationsParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            stream: z.boolean().default(false),
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description:
        'If stream is true, returns a SSE stream. Otherwise, returns the final event as JSON.',
      content: {
        [http.MediaTypes.JSON]: { schema: runSyncAPIResponseSchema },
        [http.MediaTypes.SSE]: { schema: legacyChainEventDtoSchema },
      },
    },
  },
})

export type AttachRoute = typeof attachRoute
