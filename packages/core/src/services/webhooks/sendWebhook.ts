import type { WebhookPayload } from './types'

export interface WebhookSendOptions {
  url: string
  payload: WebhookPayload | Record<string, unknown>
  headers?: Record<string, string>
}

export interface WebhookSendResponse {
  success: boolean
  statusCode: number
  responseBody?: string
  error?: Error
}

export async function sendWebhook({
  url,
  payload,
  headers = {},
}: WebhookSendOptions): Promise<WebhookSendResponse> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    })

    return {
      success: response.ok,
      statusCode: response.status,
      responseBody: await response.text(),
    }
  } catch (error) {
    return {
      success: false,
      statusCode: 0,
      error: error instanceof Error ? error : new Error('Unknown error'),
    }
  }
}
