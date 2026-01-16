import { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { Result } from '@latitude-data/core/lib/Result'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BadRequestError,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'

const mocks = vi.hoisted(() => {
  return {
    parseWebhookEvent: vi.fn(),
    handleSubscriptionCreated: vi.fn(() =>
      Promise.resolve(Result.ok({ success: true })),
    ),
    handleSubscriptionUpdatedOrCreated: vi.fn(() =>
      Promise.resolve(Result.ok({ success: true })),
    ),
    handleSubscriptionCancelled: vi.fn(() =>
      Promise.resolve(Result.ok({ success: true })),
    ),
  }
})

vi.mock('@latitude-data/core/services/billing/parseWebhookEvent', () => ({
  parseWebhookEvent: mocks.parseWebhookEvent,
}))

vi.mock(
  '@latitude-data/core/services/billing/handleSubscriptionCreated',
  () => ({
    handleSubscriptionCreated: mocks.handleSubscriptionCreated,
  }),
)

vi.mock(
  '@latitude-data/core/services/billing/handleSubscriptionUpdatedOrCreated',
  () => ({
    handleSubscriptionUpdatedOrCreated:
      mocks.handleSubscriptionUpdatedOrCreated,
  }),
)

vi.mock(
  '@latitude-data/core/services/billing/handleSubscriptionCancelled',
  () => ({
    handleSubscriptionCancelled: mocks.handleSubscriptionCancelled,
  }),
)

import { POST } from './route'

describe('POST /api/webhooks/stripe', () => {
  let mockRequest: NextRequest

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('webhook event parsing errors', () => {
    it('should return 422 if Stripe SDK is not initialized', async () => {
      mocks.parseWebhookEvent.mockResolvedValue(
        Result.error(
          new UnprocessableEntityError(
            'Stripe SDK not initialized. Server configuration error.',
          ),
        ),
      )

      mockRequest = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          headers: { 'stripe-signature': 'valid-signature' },
          body: JSON.stringify({ type: 'test.event' }),
        },
      )

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(422)
      const body = await response.json()
      expect(body.message).toContain(
        'Stripe SDK not initialized. Server configuration error.',
      )
    })

    it('should return 422 if webhook secret is not configured', async () => {
      mocks.parseWebhookEvent.mockResolvedValue(
        Result.error(
          new UnprocessableEntityError(
            'Stripe webhook secret is not configured. Please set STRIPE_WEBHOOK_SECRET.',
          ),
        ),
      )

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify({ type: 'test.event' }),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(422)
      const body = await response.json()
      expect(body.message).toContain(
        'Stripe webhook secret is not configured. Please set STRIPE_WEBHOOK_SECRET.',
      )
    })

    it('should return 400 if stripe-signature header is missing', async () => {
      mocks.parseWebhookEvent.mockResolvedValue(
        Result.error(new BadRequestError('Missing Stripe signature header')),
      )

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
      mocks.parseWebhookEvent.mockResolvedValue(
        Result.error(
          new UnprocessableEntityError('Webhook Error: Invalid signature'),
        ),
      )

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'invalid-signature' },
        body: JSON.stringify({ type: 'test.event' }),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(422)
      const body = await response.json()
      expect(body.message).toContain('Webhook Error: Invalid signature')
    })
  })

  describe('customer.subscription.created', () => {
    const mockSubscription = {
      id: 'sub_123',
      status: 'active',
      customer: 'cus_123',
      metadata: { workspaceId: '1' },
    } as unknown as Stripe.Subscription

    it('should call handleSubscriptionCreated and return 200', async () => {
      const eventPayload = {
        type: 'customer.subscription.created',
        data: { object: mockSubscription },
      } as Stripe.Event

      mocks.parseWebhookEvent.mockResolvedValue(Result.ok(eventPayload))

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(200)
      const responseBody = await response.json()
      expect(responseBody.received).toBe(true)
      expect(responseBody.event_type).toBe('customer.subscription.created')
      expect(mocks.handleSubscriptionCreated).toHaveBeenCalledWith({
        stripeSubscription: mockSubscription,
      })
    })

    it('should pass subscription to handler regardless of status', async () => {
      const incompleteSubscription = {
        ...mockSubscription,
        status: 'incomplete',
      } as unknown as Stripe.Subscription

      const eventPayload = {
        type: 'customer.subscription.created',
        data: { object: incompleteSubscription },
      } as Stripe.Event

      mocks.parseWebhookEvent.mockResolvedValue(Result.ok(eventPayload))

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(200)
      expect(mocks.handleSubscriptionCreated).toHaveBeenCalledWith({
        stripeSubscription: incompleteSubscription,
      })
    })
  })

  describe('customer.subscription.updated', () => {
    const mockSubscription = {
      id: 'sub_123',
      status: 'active',
      customer: 'cus_123',
    } as unknown as Stripe.Subscription

    it('should call handleSubscriptionUpdatedOrCreated and return 200', async () => {
      const eventPayload = {
        type: 'customer.subscription.updated',
        data: { object: mockSubscription },
      } as Stripe.Event

      mocks.parseWebhookEvent.mockResolvedValue(Result.ok(eventPayload))

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(200)
      const responseBody = await response.json()
      expect(responseBody.received).toBe(true)
      expect(responseBody.event_type).toBe('customer.subscription.updated')
      expect(mocks.handleSubscriptionUpdatedOrCreated).toHaveBeenCalledWith({
        stripeSubscription: mockSubscription,
      })
    })

    it('should pass subscription to handler regardless of status', async () => {
      const canceledSubscription = {
        ...mockSubscription,
        status: 'canceled',
      } as unknown as Stripe.Subscription

      const eventPayload = {
        type: 'customer.subscription.updated',
        data: { object: canceledSubscription },
      } as Stripe.Event

      mocks.parseWebhookEvent.mockResolvedValue(Result.ok(eventPayload))

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(200)
      expect(mocks.handleSubscriptionUpdatedOrCreated).toHaveBeenCalledWith({
        stripeSubscription: canceledSubscription,
      })
    })
  })

  describe('customer.subscription.deleted', () => {
    const mockSubscription = {
      id: 'sub_123',
      status: 'canceled',
      customer: 'cus_123',
    } as unknown as Stripe.Subscription

    it('should call handleSubscriptionCancelled and return 200', async () => {
      const eventPayload = {
        type: 'customer.subscription.deleted',
        data: { object: mockSubscription },
      } as Stripe.Event

      mocks.parseWebhookEvent.mockResolvedValue(Result.ok(eventPayload))

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(200)
      const responseBody = await response.json()
      expect(responseBody.received).toBe(true)
      expect(responseBody.event_type).toBe('customer.subscription.deleted')
      expect(mocks.handleSubscriptionCancelled).toHaveBeenCalledWith({
        stripeSubscription: mockSubscription,
      })
    })
  })

  describe('unhandled event types', () => {
    it('should return 204 for unhandled event types', async () => {
      const eventPayload = {
        id: 'evt_unhandled_123',
        object: 'event' as const,
        api_version: '2020-08-27' as const,
        created: Date.now(),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'customer.created',
        data: { object: {} },
      } as unknown as Stripe.Event

      mocks.parseWebhookEvent.mockResolvedValue(Result.ok(eventPayload))

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(204)
      expect(mocks.handleSubscriptionCreated).not.toHaveBeenCalled()
      expect(mocks.handleSubscriptionUpdatedOrCreated).not.toHaveBeenCalled()
      expect(mocks.handleSubscriptionCancelled).not.toHaveBeenCalled()
    })

    it('should return 204 for invoice events', async () => {
      const eventPayload = {
        type: 'invoice.paid',
        data: { object: { id: 'inv_123' } },
      } as unknown as Stripe.Event

      mocks.parseWebhookEvent.mockResolvedValue(Result.ok(eventPayload))

      mockRequest = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid-signature' },
        body: JSON.stringify(eventPayload),
      })

      const response = await POST(mockRequest, {} as any)

      expect(response.status).toBe(204)
    })
  })
})
