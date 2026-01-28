import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { ProviderApiKeySchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const updateProviderApiKeyRoute = createOpenAPIRoute({
  method: 'put',
  path: API_ROUTES.v3.providerApiKeys.update,
  tags: ['Provider API Keys'],
  security: [{ bearerAuth: [] }],
  summary: 'Update a provider API key',
  description: 'Updates a provider API key name',
  request: {
    params: z.object({
      providerApiKeyId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Provider API key updated successfully',
      content: {
        'application/json': {
          schema: ProviderApiKeySchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
