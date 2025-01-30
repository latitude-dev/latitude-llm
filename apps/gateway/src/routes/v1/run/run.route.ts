import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  legacyChainEventDtoSchema,
  internalInfoSchema,
} from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/v2/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

export const runRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.v1.documents.run,
  tags: ['V1_DEPRECATED'],
  request: {
    params: documentParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: internalInfoSchema.extend({
            path: z.string(),
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
      description: 'Returns a SSE stream',
      content: {
        [http.MediaTypes.SSE]: { schema: legacyChainEventDtoSchema },
      },
    },
  },
})

export type RunRoute = typeof runRoute
