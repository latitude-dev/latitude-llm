import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'

export const clientToolResultBodySchema = z.object({
  toolCallId: z.string(),
  result: z.any().openapi({
    description: 'Tool execution result (any JSON-serializable value)',
    type: 'object',
    additionalProperties: true,
  }),
  isError: z.boolean().default(false),
})

export type ClientToolResultBodySchema = z.infer<
  typeof clientToolResultBodySchema
>

export const clientToolResultRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.api.v3.tools.results,
  tags: ['Tools'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: clientToolResultBodySchema,
        },
      },
    },
  },
  responses: GENERIC_ERROR_RESPONSES,
})

export type ClientToolResultRoute = typeof clientToolResultRoute
