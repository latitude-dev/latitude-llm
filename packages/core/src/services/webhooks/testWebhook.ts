import { Result, TypedResult } from '../../lib/Result'
import { sendWebhook } from './sendWebhook'
import { WebhookTestResponse } from './types'

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
    // Network connectivity issues
    if (
      response.error?.message?.includes('ECONNREFUSED') ||
      response.error?.message?.includes('ECONNRESET')
    ) {
      return Result.error(
        new Error(
          'Could not connect to the webhook URL. Please check if the server is running and accessible.',
        ),
      )
    }

    if (response.error?.message?.includes('ETIMEDOUT')) {
      return Result.error(
        new Error(
          'Connection timed out. The webhook server took too long to respond.',
        ),
      )
    }

    if (response.error?.message?.includes('CERT_')) {
      return Result.error(
        new Error(
          'SSL/TLS certificate validation failed. Please check the certificate configuration.',
        ),
      )
    }

    // HTTP status code based errors
    if (response.statusCode) {
      if (response.statusCode === 404) {
        return Result.error(
          new Error(
            'Webhook URL not found (404). Please verify the endpoint URL.',
          ),
        )
      }
      if (response.statusCode === 401 || response.statusCode === 403) {
        return Result.error(
          new Error(
            'Authentication failed. The webhook endpoint requires valid credentials.',
          ),
        )
      }
      if (response.statusCode === 405) {
        return Result.error(
          new Error(
            'Method not allowed. The webhook endpoint does not accept POST requests.',
          ),
        )
      }
      if (response.statusCode === 429) {
        return Result.error(
          new Error('Rate limit exceeded. Please try again later.'),
        )
      }
      if (response.statusCode >= 500) {
        return Result.error(
          new Error(
            `Server error (${response.statusCode}). The webhook server encountered an internal error.`,
          ),
        )
      }
    }

    // URL format issues
    if (response.error?.message?.includes('Invalid URL')) {
      return Result.error(
        new Error(
          'Invalid webhook URL format. Please provide a valid HTTP/HTTPS URL.',
        ),
      )
    }

    // Fallback error
    return Result.error(
      response.error ||
        new Error(
          'Failed to test webhook. Please check the URL and try again.',
        ),
    )
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
