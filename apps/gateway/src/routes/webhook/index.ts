import { createRouter } from '$/openApi/createApp'
import { OpenAPIHono } from '@hono/zod-openapi'
import { emailWebhookHandler, emailWebhookRoute } from './email'
import {
  integrationWebhookHandler,
  integrationWebhookRoute,
} from './integration'

export function configureWebhookRoutes(app: OpenAPIHono) {
  const router = createRouter()
    .openapi(emailWebhookRoute, emailWebhookHandler)
    .openapi(integrationWebhookRoute, integrationWebhookHandler)

  app.route('/', router)
}
