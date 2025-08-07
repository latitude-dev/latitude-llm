import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute } from '@hono/zod-openapi'
import { emailWebhookBodySchema } from './bodySchema'
import { webhookRateLimitMiddleware } from '$/middlewares/webhookRateLimit'

export const emailWebhookRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.webhook.email,
  tags: ['Webhooks'],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: emailWebhookBodySchema,
        },
      },
    },
  },
  responses: GENERIC_ERROR_RESPONSES,
  beforeHandle: [webhookRateLimitMiddleware(10)],
})

export type EmailWebhookRoute = typeof emailWebhookRoute
