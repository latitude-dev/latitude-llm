import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { ProviderApiKeySchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const getAllProviderApiKeysRoute = createOpenAPIRoute({
  method: 'get',
  path: API_ROUTES.v3.providerApiKeys.getAll,
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
