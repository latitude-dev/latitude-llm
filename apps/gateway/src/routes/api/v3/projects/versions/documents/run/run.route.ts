import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  internalInfoSchema,
  legacyChainEventDtoSchema,
  runBackgroundAPIResponseSchema,
  runSyncAPIResponseSchema,
} from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'
import { documentParamsSchema } from '../paramsSchema'

export const runRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.api.v3.projects.documents.run,
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
            parameters: z
              .record(z.string(), z.any())
              .optional()
              .default({})
              .openapi({
                type: 'object',
                additionalProperties: true,
                description: 'Document parameters as key-value pairs',
              }),
            tools: z.array(z.string()).optional().default([]),
            userMessage: z.string().optional(),
            background: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description:
        'If stream is true, returns a SSE stream. Otherwise, returns the final event as JSON. If background is true, enqueues the run and returns the job.',
      content: {
        [http.MediaTypes.JSON]: {
          schema: runSyncAPIResponseSchema.or(runBackgroundAPIResponseSchema),
        },
        [http.MediaTypes.SSE]: { schema: legacyChainEventDtoSchema },
      },
    },
  },
})

export type RunRoute = typeof runRoute
