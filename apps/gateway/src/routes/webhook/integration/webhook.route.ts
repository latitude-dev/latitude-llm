import http from '$/common/http'
import { webhookRateLimitMiddleware } from '$/middlewares/webhookRateLimit'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'

export const integrationWebhookRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.webhook.integration,
  tags: ['Webhooks'],
  request: {
    params: z.object({
      triggerUuid: z.string(),
    }),
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.any(),
        },
      },
    },
  },
  responses: GENERIC_ERROR_RESPONSES,
  beforeHandle: [webhookRateLimitMiddleware(10)],
})

export type IntegrationWebhookRoute = typeof integrationWebhookRoute
