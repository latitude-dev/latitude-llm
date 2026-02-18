import { z } from '@hono/zod-openapi'
import { Providers } from '@latitude-data/constants'
import { ProviderApiKeySchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const createProviderApiKeyRouteConfig = defineRouteConfig({
  method: 'post',
  tags: ['Provider API Keys'],
  security: [{ bearerAuth: [] }],
  summary: 'Create a new provider API key',
  description: 'Creates a new provider API key in the workspace',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            provider: z.nativeEnum(Providers),
            token: z.string(),
            url: z.string().optional(),
            defaultModel: z.string().optional(),
            configuration: z.record(z.string(), z.any()).optional().openapi({
              type: 'object',
              additionalProperties: true,
              description: 'Provider configuration as key-value pairs',
            }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Provider API key created successfully',
      content: {
        'application/json': {
          schema: ProviderApiKeySchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
