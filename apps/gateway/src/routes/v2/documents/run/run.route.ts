import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/v2/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'
import {
  chainEventDtoSchema,
  LogSources,
  runSyncAPIResponseSchema,
} from '@latitude-data/core/browser'

export const runRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.v2.documents.run,
  tags: ['Documents'],
  request: {
    params: documentParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            path: z.string(),
            stream: z.boolean().default(false),
            customIdentifier: z.string().optional(),
            parameters: z.record(z.any()).optional().default({}),
            __internal: z
              .object({
                source: z.nativeEnum(LogSources).optional(),
              })
              .optional(),
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

export type RunRoute = typeof runRoute
