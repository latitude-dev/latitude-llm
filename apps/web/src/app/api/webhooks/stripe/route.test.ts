import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoist mocks for env and services
const mocks = vi.hoisted(() => {
  return {
    env: {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
    },
    handleSubscriptionUpdate: vi.fn(() =>
      Promise.resolve({ unwrap: () => ({}) }),
    ),
    // Mock the actual Stripe constructor
    Stripe: vi.fn(),
    // Store the mock constructEvent function here to be used by the Stripe mock instance
    mockConstructEvent: vi.fn(),
  }
})

// Mock dependencies before they are imported by the route file
vi.mock('stripe', () => ({
  default: mocks.Stripe, // This will be the vi.fn() defined above
}))

vi.mock('@latitude-data/env', () => ({
  env: mocks.env,
}))

vi.mock(
  '@latitude-data/core/services/billing/handleSubscriptionUpdate',
  () => ({
    handleSubscriptionUpdate: mocks.handleSubscriptionUpdate,
  }),
)

// Now import the route handler
import { POST } from './route'

describe('POST /api/webhooks/stripe', () => {
  let mockRequest: NextRequest

  beforeEach(() => {
    vi.resetModules() // Important to reset module cache for env changes to take effect in the route
    vi.clearAllMocks()

    mocks.Stripe.mockImplementation((key: string) => {
      if (!key) return undefined
      return {
        webhooks: {
          constructEvent: mocks.mockConstructEvent,
        },
      } as unknown as Stripe
    })

    // Default behavior for constructEvent:
    // Tests requiring specific event objects should override this mock directly.
    mocks.mockConstructEvent.mockImplementation((body, sig, secret) => {
      if (secret !== mocks.env.STRIPE_WEBHOOK_SECRET) {
        const err = new Error('Mocked Stripe Webhook: Invalid secret')
        ;(err as any).type = 'StripeSignatureVerificationError'
        throw err
      }
      if (sig !== 'valid-signature') {
        const err = new Error('Mocked Stripe Webhook: Invalid signature')
        ;(err as any).type = 'StripeSignatureVerificationError'
        throw err
      }
      // For most tests, the actual event construction is based on the input `body`.
      // If a test needs a very specific Stripe.Event object, it should mock
      // this function's return value directly for that test case.
      try {
        const event = JSON.parse(body as string)
        // A basic check, actual Stripe events are more complex and validated by Stripe SDK.
        if (
          event &&
          typeof event.type === 'string' &&
          typeof event.data === 'object'
        ) {
          return event as Stripe.Event // This cast is okay for testing purposes
        }
        throw new Error('Parsed body does not resemble a Stripe event.')
      } catch (error) {
        // This fallback should ideally not be hit if tests correctly mock return values
        // or provide valid JSON string bodies that parse into expected event structures.
        console.error(
          'Error in mockConstructEvent default implementation:',
          error,
        )
        throw new Error(
          'Mock constructEvent error: Could not parse body or body was not a valid event. Ensure your test provides a valid JSON string for the event or mock constructEvent for this test case.',
        )
      }
    })

    mocks.env.STRIPE_SECRET_KEY = 'sk_test_123'
    mocks.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123'
  })

  it('should return 422 if Stripe SDK is not initialized (no secret key)', async () => {
    mocks.env.STRIPE_SECRET_KEY = '' // Simulate missing secret key

    mockRequest = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid-signature' },
      body: JSON.stringify({
        type: 'customer.subscription.created',
        data: { object: { status: 'active' } },
      }),
    })

    const response = await POST(mockRequest, {} as any) // Pass empty context

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.message).toContain(
      'Stripe SDK not initialized. Server configuration error.',
    )
  })

  it('should return 422 if webhook secret is not configured', async () => {
    mocks.env.STRIPE_WEBHOOK_SECRET = '' // Simulate missing webhook secret

    mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid-signature' },
      body: JSON.stringify({
        type: 'customer.subscription.created',
        data: { object: { status: 'active' } },
      }),
    })

    const response = await POST(mockRequest, {} as any)

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.message).toContain(
      'Stripe webhook secret is not configured. Please set STRIPE_WEBHOOK_SECRET.',
    )
  })

  it('should return 400 if stripe-signature header is missing', async () => {
    mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ type: 'test.event' }),
    })

    const response = await POST(mockRequest, {} as any)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('Missing Stripe signature header')
  })

  it('should return 422 if event construction fails (invalid signature)', async () => {
    mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'invalid-signature' },
      body: JSON.stringify({ type: 'test.event' }),
    })

    // mockConstructEvent is set up to throw for 'invalid-signature'
    const response = await POST(mockRequest, {} as any)

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.message).toContain(
      'Webhook Error: Mocked Stripe Webhook: Invalid signature',
    )
  })

  describe('when event is customer.subscription.created', () => {
    const mockSubscriptionActive = {
      id: 'sub_active_123',
      status: 'active',
      // Add other necessary Stripe.Subscription properties if your handler uses them
    } as Stripe.Subscription

    const mockSubscriptionInactive = {
      id: 'sub_inactive_123',
      status: 'canceled',
    } as Stripe.Subscription

    it('should call handleSubscriptionUpdate if status is active and return 200', async () => {
      const eventPayload = {
        type: 'customer.subscription.created',
        data: { object: mockSubscriptionActive },
      }
      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      // Ensure constructEvent returns our specific payload
      mocks.mockConstructEvent.mockReturnValue(eventPayload as Stripe.Event)
      mocks.handleSubscriptionUpdate.mockResolvedValue({
        unwrap: () => ({ success: true }),
      } as any)

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(200)
      const responseBody = await response.json()
      expect(responseBody.received).toBe(true)
      expect(responseBody.event_type).toBe('customer.subscription.created')
      expect(mocks.handleSubscriptionUpdate).toHaveBeenCalledWith({
        stripeSubscription: mockSubscriptionActive,
        stripe: expect.anything(), // The mocked stripe instance
      })
    })

    it('should NOT call handleSubscriptionUpdate if status is not active and return 200', async () => {
      const eventPayload = {
        type: 'customer.subscription.created',
        data: { object: mockSubscriptionInactive },
      }
      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      mocks.mockConstructEvent.mockReturnValue(eventPayload as Stripe.Event)

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(200)
      const responseBody = await response.json()
      expect(responseBody.received).toBe(true)
      expect(responseBody.event_type).toBe('customer.subscription.created')
      expect(mocks.handleSubscriptionUpdate).not.toHaveBeenCalled()
    })
  })

  it('should return 200 for unhandled event types', async () => {
    const eventPayload = {
      id: 'evt_unhandled_123',
      object: 'event' as const, // Required for Stripe.Event base
      api_version: '2020-08-27' as const,
      created: Date.now(),
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      // @ts-expect-error - This type won't be handled by the route
      type: 'some.other.unhandled.event', // This type won't be handled by the route
      // @ts-expect-error - This type won't be handled by the route
      data: { object: {} },
    } satisfies Stripe.Event // Use 'satisfies' for better type checking here

    mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid-signature' },
      body: JSON.stringify(eventPayload), // Body is the specific event
    })

    // Ensure constructEvent returns our specific payload for this test
    mocks.mockConstructEvent.mockReturnValue(eventPayload)

    const response = await POST(mockRequest, {} as any)

    expect(response.status).toBe(204)
  })
})
