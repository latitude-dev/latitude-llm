import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { ProviderApiKeySchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const destroyProviderApiKeyRoute = createOpenAPIRoute({
  method: 'delete',
  path: API_ROUTES.v3.providerApiKeys.destroy,
  tags: ['Provider API Keys'],
  security: [{ bearerAuth: [] }],
  summary: 'Delete a provider API key',
  description: 'Soft deletes a provider API key',
  request: {
    params: z.object({
      providerApiKeyId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Provider API key deleted successfully',
      content: {
        'application/json': {
          schema: ProviderApiKeySchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
