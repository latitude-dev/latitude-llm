import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingError } from '@latitude-data/constants/errors'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import { createCheckoutSession } from './createCheckoutSession'
import * as stripeModule from '../../lib/stripe'
import { Result } from '../../lib/Result'

const mockSessionsCreate = vi.fn()

const mockStripe = {
  checkout: {
    sessions: {
      create: mockSessionsCreate,
    },
  },
}

vi.mock('../../lib/stripe', () => ({
  getStripe: vi.fn(),
}))

describe('createCheckoutSession', () => {
  const defaultParams = {
    plan: SubscriptionPlan.TeamV4,
    workspaceId: 123,
    userEmail: 'test@example.com',
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(stripeModule.getStripe).mockReturnValue(Result.ok(mockStripe as any))
  })

  describe('successful checkout session creation', () => {
    it('returns checkout session URL on success', async () => {
      const expectedUrl = 'https://checkout.stripe.com/session123'
      mockSessionsCreate.mockResolvedValue({ url: expectedUrl })

      const result = await createCheckoutSession(defaultParams)

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual({ url: expectedUrl })
    })

    it('passes correct parameters to Stripe', async () => {
      mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session' })

      await createCheckoutSession(defaultParams)

      expect(mockSessionsCreate).toHaveBeenCalledWith({
        mode: 'subscription',
        customer_email: 'test@example.com',
        line_items: [
          { price: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId, quantity: 1 },
        ],
        subscription_data: {
          metadata: {
            workspaceId: '123',
          },
        },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        name_collection: {
          individual: { enabled: true },
          business: { enabled: true },
        },
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      })
    })

    it('uses correct price ID for TeamV3 plan', async () => {
      mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session' })

      await createCheckoutSession({
        ...defaultParams,
        plan: SubscriptionPlan.TeamV3,
      })

      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            { price: SubscriptionPlans[SubscriptionPlan.TeamV3].stripePriceId, quantity: 1 },
          ],
        }),
      )
    })

    it('uses correct price ID for ProV2 plan', async () => {
      mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session' })

      await createCheckoutSession({
        ...defaultParams,
        plan: SubscriptionPlan.ProV2,
      })

      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            { price: SubscriptionPlans[SubscriptionPlan.ProV2].stripePriceId, quantity: 1 },
          ],
        }),
      )
    })

    it('converts workspaceId to string in metadata', async () => {
      mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session' })

      await createCheckoutSession({
        ...defaultParams,
        workspaceId: 456789,
      })

      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: {
            metadata: {
              workspaceId: '456789',
            },
          },
        }),
      )
    })
  })

  describe('error cases', () => {
    it('returns error when Stripe is not configured', async () => {
      const stripeError = new BillingError('Stripe not configured')
      vi.mocked(stripeModule.getStripe).mockReturnValue(Result.error(stripeError))

      const result = await createCheckoutSession(defaultParams)

      expect(result.ok).toBe(false)
      expect(result.error).toBe(stripeError)
      expect(mockSessionsCreate).not.toHaveBeenCalled()
    })

    it('returns error when session URL is null', async () => {
      mockSessionsCreate.mockResolvedValue({ url: null })

      const result = await createCheckoutSession(defaultParams)

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('no redirect URL was returned')
    })

    it('returns error when session URL is undefined', async () => {
      mockSessionsCreate.mockResolvedValue({})

      const result = await createCheckoutSession(defaultParams)

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('no redirect URL was returned')
    })

    it('returns error when Stripe API throws', async () => {
      mockSessionsCreate.mockRejectedValue(new Error('Stripe API error'))

      const result = await createCheckoutSession(defaultParams)

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('Failed to create checkout session')
      expect(result.error!.message).toContain('Stripe API error')
    })

    it('returns error when Stripe throws rate limit error', async () => {
      mockSessionsCreate.mockRejectedValue(new Error('Rate limit exceeded'))

      const result = await createCheckoutSession(defaultParams)

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('Rate limit exceeded')
    })

    it('returns error when Stripe throws invalid price error', async () => {
      mockSessionsCreate.mockRejectedValue(
        new Error('No such price: price_invalid'),
      )

      const result = await createCheckoutSession(defaultParams)

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('No such price')
    })
  })

  describe('getStripe call', () => {
    it('passes tags to getStripe for error context', async () => {
      mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session' })

      await createCheckoutSession(defaultParams)

      expect(stripeModule.getStripe).toHaveBeenCalledWith({
        tags: {
          workspaceId: 123,
          userEmail: 'test@example.com',
          plan: SubscriptionPlan.TeamV4,
        },
      })
    })
  })
})
