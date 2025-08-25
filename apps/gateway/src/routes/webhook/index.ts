import { createRouter } from '$/openApi/createApp'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { emailWebhookHandler, emailWebhookRoute } from './email'
import {
  integrationLegacyWebhookHandler,
  integrationWebhookHandler,
  integrationWebhookRoute,
  integrationLegacyWebhookRoute,
} from './integration'

export function configureWebhookRoutes(app: OpenAPIHono) {
  const router = createRouter()
    .openapi(emailWebhookRoute, emailWebhookHandler)
    .openapi(integrationLegacyWebhookRoute, integrationLegacyWebhookHandler)
    .openapi(integrationWebhookRoute, integrationWebhookHandler)

  app.route('/', router)
}
