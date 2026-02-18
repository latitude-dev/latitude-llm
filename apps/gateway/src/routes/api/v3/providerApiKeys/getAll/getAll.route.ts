import { z } from '@hono/zod-openapi'
import { ProviderApiKeySchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const getAllProviderApiKeysRouteConfig = defineRouteConfig({
  method: 'get',
  tags: ['Provider API Keys'],
  security: [{ bearerAuth: [] }],
  summary: 'Get all provider API keys for a workspace',
  description:
    'Returns all provider API keys for the authenticated workspace (tokens are masked)',
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.array(ProviderApiKeySchema),
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
