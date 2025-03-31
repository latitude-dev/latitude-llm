import { describe, expect, it, vi, beforeEach } from 'vitest'
import { testWebhookEndpoint } from './testWebhook'
import { sendWebhook } from './sendWebhook'

// Mock the sendWebhook function
vi.mock('./sendWebhook', () => ({
  sendWebhook: vi.fn(),
}))

describe('testWebhookEndpoint', () => {
  const mockUrl = 'https://test.com/webhook'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns successful response when webhook test succeeds', async () => {
    // Mock successful response
    vi.mocked(sendWebhook).mockResolvedValue({
      success: true,
      statusCode: 200,
      responseBody: 'OK',
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual({
      success: true,
      statusCode: 200,
      message: 'Webhook test successful',
    })
  })

  it('handles connection refused errors', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 0,
      error: new Error('ECONNREFUSED'),
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Could not connect to the webhook URL. Please check if the server is running and accessible.',
    )
  })

  it('handles connection reset errors', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 0,
      error: new Error('ECONNRESET'),
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Could not connect to the webhook URL. Please check if the server is running and accessible.',
    )
  })

  it('handles timeout errors', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 0,
      error: new Error('ETIMEDOUT'),
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Connection timed out. The webhook server took too long to respond.',
    )
  })

  it('handles SSL/TLS certificate errors', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 0,
      error: new Error('CERT_HAS_EXPIRED'),
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'SSL/TLS certificate validation failed. Please check the certificate configuration.',
    )
  })

  it('handles 404 errors', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 404,
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Webhook URL not found (404). Please verify the endpoint URL.',
    )
  })

  it('handles authentication errors (401)', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 401,
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Authentication failed. The webhook endpoint requires valid credentials.',
    )
  })

  it('handles method not allowed errors (405)', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 405,
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Method not allowed. The webhook endpoint does not accept POST requests.',
    )
  })

  it('handles rate limit errors (429)', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 429,
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Rate limit exceeded. Please try again later.',
    )
  })

  it('handles server errors (500+)', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 503,
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Server error (503). The webhook server encountered an internal error.',
    )
  })

  it('handles invalid URL format', async () => {
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 0,
      error: new Error('Invalid URL'),
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Invalid webhook URL format. Please provide a valid HTTP/HTTPS URL.',
    )
  })

  it('handles generic errors', async () => {
    const genericError = new Error('Something went wrong')
    vi.mocked(sendWebhook).mockResolvedValue({
      success: false,
      statusCode: 0,
      error: genericError,
    })

    const result = await testWebhookEndpoint({ url: mockUrl })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(genericError)
  })
})
