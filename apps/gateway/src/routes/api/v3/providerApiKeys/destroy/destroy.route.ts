import { z } from '@hono/zod-openapi'
import { ProviderApiKeySchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const destroyProviderApiKeyRouteConfig = defineRouteConfig({
  method: 'delete',
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
