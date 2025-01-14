import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  chainEventDtoSchema,
  internalInfoSchema,
  runSyncAPIResponseSchema,
} from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/v2/conversations/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'
import { toolCallResponseSchema } from '@latitude-data/constants'

export const resumeRoute = createRoute({
  operationId: 'resumeConversation',
  tags: ['Conversations'],
  method: http.Methods.POST,
  path: ROUTES.v2.conversations.resume,
  request: {
    params: conversationsParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: internalInfoSchema.extend({
            versionUuid: z
              .string()
              .optional()
              .openapi({ description: 'Prompt version uuid' }),
            toolCallResponses: z.array(toolCallResponseSchema),
            stream: z.boolean().optional().default(false),
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
        [http.MediaTypes.SSE]: { schema: chainEventDtoSchema },
      },
    },
  },
})

export type ResumeRoute = typeof resumeRoute
