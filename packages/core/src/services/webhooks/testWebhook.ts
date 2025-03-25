import { Result, TypedResult } from '../../lib'
import { WebhookTestResponse } from './types'
import { sendWebhook } from './sendWebhook'

interface TestWebhookEndpointParams {
  url: string
}

export async function testWebhookEndpoint({
  url,
}: TestWebhookEndpointParams): Promise<
  TypedResult<WebhookTestResponse, Error>
> {
  const response = await sendWebhook({
    url,
    headers: {
      'User-Agent': 'Latitude-Webhook-Test',
    },
    payload: {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from Latitude',
      },
    },
  })

  if (!response.success) {
    return Result.error(response.error || new Error('Failed to test webhook'))
  }

  const testResponse: WebhookTestResponse = {
    success: response.success,
    statusCode: response.statusCode,
    message: response.success
      ? 'Webhook test successful'
      : `Webhook test failed: Status ${response.statusCode}`,
  }

  return Result.ok(testResponse)
}
