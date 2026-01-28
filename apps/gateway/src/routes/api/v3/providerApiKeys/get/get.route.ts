import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { ProviderApiKeySchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const getProviderApiKeyRoute = createOpenAPIRoute({
  method: 'get',
  path: API_ROUTES.v3.providerApiKeys.get,
  tags: ['Provider API Keys'],
  security: [{ bearerAuth: [] }],
  summary: 'Get a provider API key by ID',
  description: 'Returns a single provider API key by its ID (token is masked)',
  request: {
    params: z.object({
      providerApiKeyId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: ProviderApiKeySchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
