import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'
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

export const clientToolResultRouteConfig = defineRouteConfig({
  method: http.Methods.POST,
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

export type ClientToolResultRoute = typeof clientToolResultRouteConfig
