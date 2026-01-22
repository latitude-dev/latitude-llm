import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '@latitude-data/core/lib/Result'
import {
  SubscriptionPlan,
  getContactSalesLink,
} from '@latitude-data/core/plans'
import { User } from '@latitude-data/core/schema/models/types/User'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'

const mocks = vi.hoisted(() => {
  return {
    getDataFromSession: vi.fn(),
    createCheckoutSession: vi.fn(),
  }
})

vi.mock('$/data-access', () => ({
  getDataFromSession: mocks.getDataFromSession,
}))

vi.mock('@latitude-data/core/services/billing/createCheckoutSession', () => ({
  createCheckoutSession: mocks.createCheckoutSession,
}))

import { GET } from './route'

describe('GET /api/pricings/[slug]', () => {
  let mockUser: User
  let mockWorkspace: WorkspaceDto

  beforeEach(() => {
    vi.clearAllMocks()

    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    } as User

    mockWorkspace = {
      id: 1,
      name: 'Test Workspace',
      stripeCustomerId: null,
      currentSubscription: {
        plan: SubscriptionPlan.HobbyV3,
      },
    } as unknown as WorkspaceDto
  })

  describe('authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: null,
        workspace: null,
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ message: 'Unauthorized' })
    })
  })

  describe('invalid plan slug', () => {
    it('should return 400 for invalid pricing plan', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: mockWorkspace,
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/invalid_plan',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'invalid_plan' }),
      } as any)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ message: 'Invalid pricing plan' })
    })
  })

  describe('contact sales plans', () => {
    it('should redirect to contact sales for Scale V1 plan', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: mockWorkspace,
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/scale_v1',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'scale_v1' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(getContactSalesLink())
    })

    it('should redirect to contact sales for Enterprise V1 plan', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: mockWorkspace,
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/enterprise_v1',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'enterprise_v1' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(getContactSalesLink())
    })
  })

  describe('checkout session', () => {
    it('should create checkout session for free plan users selecting Team V4', async () => {
      const checkoutUrl = 'https://checkout.stripe.com/session/123'
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          currentSubscription: { plan: SubscriptionPlan.HobbyV3 },
        },
      })
      mocks.createCheckoutSession.mockResolvedValue(
        Result.ok({ url: checkoutUrl }),
      )

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(checkoutUrl)
      expect(mocks.createCheckoutSession).toHaveBeenCalledWith({
        plan: SubscriptionPlan.TeamV4,
        workspaceId: mockWorkspace.id,
        userEmail: mockUser.email,
        successUrl: expect.stringContaining('checkout=success'),
        cancelUrl: expect.stringContaining('checkout=canceled'),
      })
    })

    it('should create checkout session for HobbyV1 users selecting Team V4', async () => {
      const checkoutUrl = 'https://checkout.stripe.com/session/456'
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          currentSubscription: { plan: SubscriptionPlan.HobbyV1 },
        },
      })
      mocks.createCheckoutSession.mockResolvedValue(
        Result.ok({ url: checkoutUrl }),
      )

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(checkoutUrl)
    })

    it('should create checkout session for HobbyV2 users selecting Team V4', async () => {
      const checkoutUrl = 'https://checkout.stripe.com/session/789'
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          currentSubscription: { plan: SubscriptionPlan.HobbyV2 },
        },
      })
      mocks.createCheckoutSession.mockResolvedValue(
        Result.ok({ url: checkoutUrl }),
      )

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(checkoutUrl)
    })
  })

  describe('legacy plans redirect to contact sales', () => {
    it('should redirect to contact sales for TeamV3 plan', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          stripeCustomerId: 'cus_123',
          currentSubscription: { plan: SubscriptionPlan.TeamV3 },
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(getContactSalesLink())
    })

    it('should redirect to contact sales for ProV2 plan', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          stripeCustomerId: 'cus_456',
          currentSubscription: { plan: SubscriptionPlan.ProV2 },
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(getContactSalesLink())
    })

    it('should redirect to contact sales for TeamV1 plan', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          stripeCustomerId: 'cus_789',
          currentSubscription: { plan: SubscriptionPlan.TeamV1 },
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(getContactSalesLink())
    })

    it('should redirect to contact sales for legacy plan even without stripe customer id', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          stripeCustomerId: null,
          currentSubscription: { plan: SubscriptionPlan.TeamV3 },
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(getContactSalesLink())
    })
  })

  describe('scale/enterprise plans redirect to contact sales', () => {
    it('should redirect to contact sales for Scale plan trying to change plans', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          currentSubscription: { plan: SubscriptionPlan.ScaleV1 },
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(getContactSalesLink())
    })

    it('should redirect to contact sales for Enterprise plan trying to change plans', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          currentSubscription: { plan: SubscriptionPlan.EnterpriseV1 },
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(getContactSalesLink())
    })
  })

  describe('plan not available', () => {
    it('should return 400 when free user tries to select non-TeamV4 paid plan', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          currentSubscription: { plan: SubscriptionPlan.HobbyV3 },
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v3',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v3' }),
      } as any)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.message).toContain(
        'not available for your current subscription',
      )
    })

    it('should return 400 when TeamV4 user tries to access TeamV4 again', async () => {
      mocks.getDataFromSession.mockResolvedValue({
        user: mockUser,
        workspace: {
          ...mockWorkspace,
          currentSubscription: { plan: SubscriptionPlan.TeamV4 },
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/pricings/team_v4',
      )

      const response = await GET(request, {
        params: Promise.resolve({ slug: 'team_v4' }),
      } as any)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.message).toContain(
        'not available for your current subscription',
      )
    })
  })
})
