import { createRouter } from '$/openApi/createApp'
import { OpenAPIHono } from '@hono/zod-openapi'
import { emailWebhookHandler, emailWebhookRoute } from './email'

export function configureWebhookRoutes(app: OpenAPIHono) {
  const router = createRouter().openapi(emailWebhookRoute, emailWebhookHandler)

  app.route('/', router)
}
