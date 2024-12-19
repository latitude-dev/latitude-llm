import http from '$/common/http'
import { createRoute, z } from '@hono/zod-openapi'
import {
  chainEventDtoSchema,
  LogSources,
  runSyncAPIResponseSchema,
} from '@latitude-data/core/browser'

export const runRoute = createRoute({
  method: http.Methods.POST,
  path: '/api/v2/projects/:projectId/versions/:versionUuid/documents/run',
  request: {
    params: z.object({
      projectId: z.string(),
      versionUuid: z.string(),
    }),
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
