import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'
import { webhookRateLimitMiddleware } from '$/middlewares/webhookRateLimit'

export const integrationLegacyWebhookRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.webhook.legacyIntegration,
  tags: ['Webhooks'],
  request: {
    params: z.object({
      triggerUuid: z.string(),
    }),
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.any().openapi({
            description: 'Webhook payload (any JSON-serializable value)',
            type: 'object',
            additionalProperties: true,
          }),
        },
      },
    },
  },
  responses: GENERIC_ERROR_RESPONSES,
  beforeHandle: [webhookRateLimitMiddleware(10)],
})

export type IntegrationLegacyWebhookRoute = typeof integrationLegacyWebhookRoute

export const integrationWebhookRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.webhook.integration,
  tags: ['Webhooks'],
  request: {
    params: z.object({
      triggerUuid: z.string(),
      commitUuid: z.string(),
    }),
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.any().openapi({
            description: 'Webhook payload (any JSON-serializable value)',
            type: 'object',
            additionalProperties: true,
          }),
        },
      },
    },
  },
  responses: GENERIC_ERROR_RESPONSES,
  beforeHandle: [webhookRateLimitMiddleware(10)],
})

export type IntegrationWebhookRoute = typeof integrationWebhookRoute
