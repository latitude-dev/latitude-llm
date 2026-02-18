import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  chainEventDtoSchema,
  runSyncAPIResponseSchema,
} from '$/openApi/schemas'
import { conversationsParamsSchema } from '$/routes/api/v3/conversations/paramsSchema'
import { z } from '@hono/zod-openapi'
import { defineRouteConfig } from '$/routes/api/helpers'

export const attachRouteConfig = defineRouteConfig({
  operationId: 'attachConversation',
  tags: ['Conversations'],
  description: 'Attach to an active conversation',
  method: http.Methods.POST,
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
        [http.MediaTypes.SSE]: { schema: chainEventDtoSchema },
      },
    },
  },
})

export type AttachRoute = typeof attachRouteConfig
