import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  legacyChainEventDtoSchema,
  internalInfoSchema,
  runSyncAPIResponseSchema,
} from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v3/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

export const runRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.api.v3.documents.run,
  tags: ['Documents'],
  description: 'Run a prompt',
  request: {
    params: documentParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: internalInfoSchema.extend({
            path: z.string(),
            stream: z.boolean().default(false),
            customIdentifier: z.string().optional(),
            parameters: z.record(z.any()).optional().default({}),
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

export type RunRoute = typeof runRoute
