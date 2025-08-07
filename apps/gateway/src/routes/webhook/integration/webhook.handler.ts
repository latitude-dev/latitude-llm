import { AppRouteHandler } from '$/openApi/types'
import { IntegrationWebhookRoute } from './webhook.route'
import { handleIntegrationTrigger } from '@latitude-data/core/services/documentTriggers/handlers/index'

// @ts-expect-error: streamSSE has type issues with zod-openapi
// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
export const integrationWebhookHandler: AppRouteHandler<
  IntegrationWebhookRoute
> = async (c) => {
  const { triggerUuid } = c.req.valid('param')
  const payload = (await c.req.json()) as Record<string, unknown>

  const result = await handleIntegrationTrigger({
    triggerUuid,
    payload,
  })

  if (result.error) {
    // Mailgun will retry the POST request if it receives any response code other than 200 or 406
    // https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/#receiving-messages-via-http-through-a-forward-action
    return c.json({ error: result.error.message }, 406)
  }

  return c.json({ success: true }, 200)
}
