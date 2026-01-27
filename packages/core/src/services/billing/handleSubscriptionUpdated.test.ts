import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { Subscription } from '../../schema/models/types/Subscription'
import { User } from '../../schema/models/types/User'
import { NotFoundError } from '../../lib/errors'

const mocks = vi.hoisted(() => ({
  subscriptionRepoFind: vi.fn(),
  createSubscription: vi.fn(),
  updateWorkspace: vi.fn(),
  issueSubscriptionGrants: vi.fn(),
  publishLater: vi.fn(),
  findFirstUserInWorkspace: vi.fn(),
}))

vi.mock('../../repositories', () => ({
  SubscriptionRepository: vi.fn().mockImplementation(() => ({
    find: mocks.subscriptionRepoFind,
  })),
}))

vi.mock('../subscriptions/create', () => ({
  createSubscription: mocks.createSubscription,
}))

vi.mock('../workspaces/update', () => ({
  updateWorkspace: mocks.updateWorkspace,
}))

vi.mock('../subscriptions/grants', () => ({
  issueSubscriptionGrants: mocks.issueSubscriptionGrants,
}))

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: mocks.publishLater,
  },
}))

vi.mock('../../data-access/users', () => ({
  findFirstUserInWorkspace: mocks.findFirstUserInWorkspace,
}))

import { handleSubscriptionUpdated } from './handleSubscriptionUpdated'

function buildStripeSubscription({
  customerId = 'cus_test123',
  status = 'active',
  priceId = SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
}: {
  customerId?: string
  status?: Stripe.Subscription.Status
  priceId?: string
} = {}): Stripe.Subscription {
  return {
    id: 'sub_test123',
    object: 'subscription',
    status,
    customer: customerId,
    metadata: { workspaceId: '1' },
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test123',
          object: 'subscription_item',
          price: { id: priceId, object: 'price' } as Stripe.Price,
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: '/v1/subscription_items',
    },
  } as unknown as Stripe.Subscription
}

function buildWorkspaceDto(
  overrides: Partial<WorkspaceDto> = {},
): WorkspaceDto {
  return {
    id: 1,
    uuid: 'test-uuid',
    name: 'Test Workspace',
    stripeCustomerId: 'cus_test123',
    currentSubscriptionId: 100,
    creatorId: 'user-123',
    defaultProviderId: null,
    isBigAccount: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    hasBillingPortal: true,
    currentSubscription: {
      id: 100,
      plan: SubscriptionPlan.TeamV3,
      workspaceId: 1,
      trialEndsAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  } as WorkspaceDto
}

function buildSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: 100,
    plan: SubscriptionPlan.TeamV3,
    workspaceId: 1,
    trialEndsAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Subscription
}

describe('handleSubscriptionUpdated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.publishLater.mockImplementation(() => Promise.resolve())
    mocks.findFirstUserInWorkspace.mockResolvedValue({
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
    } as User)
  })

  describe('subscription status validation', () => {
    it('returns error when subscription status is not active', async () => {
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({ status: 'past_due' })

      const result = await handleSubscriptionUpdated({
        workspace,
        stripeSubscription,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('is not active')
    })

    it('returns error when subscription status is incomplete', async () => {
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({
        status: 'incomplete',
      })

      const result = await handleSubscriptionUpdated({
        workspace,
        stripeSubscription,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
    })

    it('returns error when subscription status is canceled', async () => {
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({ status: 'canceled' })

      const result = await handleSubscriptionUpdated({
        workspace,
        stripeSubscription,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
    })
  })

  describe('current subscription retrieval', () => {
    it('returns error when current subscription is not found', async () => {
      const workspace = buildWorkspaceDto({ currentSubscriptionId: 999 })
      const stripeSubscription = buildStripeSubscription()

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.error(new NotFoundError('Subscription not found')),
      )

      const result = await handleSubscriptionUpdated({
        workspace,
        stripeSubscription,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain(
        'Failed to retrieve current subscription',
      )
    })
  })

  describe('plan comparison', () => {
    it('returns early without changes when plan is the same', async () => {
      const currentSubscription = buildSubscription({
        plan: SubscriptionPlan.TeamV4,
      })
      const workspace = buildWorkspaceDto({
        currentSubscription: currentSubscription,
      })
      const stripeSubscription = buildStripeSubscription({
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
      })

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.ok(currentSubscription),
      )

      const result = await handleSubscriptionUpdated({
        workspace,
        stripeSubscription,
      })

      expect(result.ok).toBe(true)
      const { workspace: returnedWorkspace, subscription } = result.unwrap()
      expect(returnedWorkspace).toBe(workspace)
      expect(subscription).toBe(currentSubscription)
      expect(mocks.createSubscription).not.toHaveBeenCalled()
      expect(mocks.updateWorkspace).not.toHaveBeenCalled()
      expect(mocks.issueSubscriptionGrants).not.toHaveBeenCalled()
    })
  })

  describe('plan change', () => {
    it('creates new subscription when plan changes', async () => {
      const currentSubscription = buildSubscription({
        plan: SubscriptionPlan.TeamV3,
      })
      const workspace = buildWorkspaceDto({
        currentSubscription: currentSubscription,
      })
      const stripeSubscription = buildStripeSubscription({
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
      })
      const newSubscription = buildSubscription({
        id: 101,
        plan: SubscriptionPlan.TeamV4,
      })
      const updatedWorkspace = buildWorkspaceDto({
        currentSubscriptionId: 101,
      })

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.ok(currentSubscription),
      )
      mocks.createSubscription.mockResolvedValue(Result.ok(newSubscription))
      mocks.updateWorkspace.mockResolvedValue(Result.ok(updatedWorkspace))
      mocks.issueSubscriptionGrants.mockResolvedValue(Result.ok({}))

      const result = await handleSubscriptionUpdated({
        workspace,
        stripeSubscription,
      })

      expect(result.ok).toBe(true)
      expect(mocks.createSubscription).toHaveBeenCalledWith(
        { workspace, plan: SubscriptionPlan.TeamV4 },
        expect.anything(),
      )
    })

    it('updates workspace with new subscription id', async () => {
      const currentSubscription = buildSubscription({
        plan: SubscriptionPlan.TeamV3,
      })
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
      })
      const newSubscription = buildSubscription({
        id: 101,
        plan: SubscriptionPlan.TeamV4,
      })
      const updatedWorkspace = buildWorkspaceDto({
        currentSubscriptionId: 101,
      })

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.ok(currentSubscription),
      )
      mocks.createSubscription.mockResolvedValue(Result.ok(newSubscription))
      mocks.updateWorkspace.mockResolvedValue(Result.ok(updatedWorkspace))
      mocks.issueSubscriptionGrants.mockResolvedValue(Result.ok({}))

      await handleSubscriptionUpdated({ workspace, stripeSubscription })

      expect(mocks.updateWorkspace).toHaveBeenCalledWith(
        workspace,
        { currentSubscriptionId: 101 },
        expect.anything(),
      )
    })

    it('issues subscription grants for new subscription', async () => {
      const currentSubscription = buildSubscription({
        plan: SubscriptionPlan.TeamV3,
      })
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
      })
      const newSubscription = buildSubscription({
        id: 101,
        plan: SubscriptionPlan.TeamV4,
      })
      const updatedWorkspace = buildWorkspaceDto({
        currentSubscriptionId: 101,
      })

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.ok(currentSubscription),
      )
      mocks.createSubscription.mockResolvedValue(Result.ok(newSubscription))
      mocks.updateWorkspace.mockResolvedValue(Result.ok(updatedWorkspace))
      mocks.issueSubscriptionGrants.mockResolvedValue(Result.ok({}))

      await handleSubscriptionUpdated({ workspace, stripeSubscription })

      expect(mocks.issueSubscriptionGrants).toHaveBeenCalledWith(
        { subscription: newSubscription, workspace },
        expect.anything(),
      )
    })

    it('returns updated workspace and new subscription', async () => {
      const currentSubscription = buildSubscription({
        plan: SubscriptionPlan.TeamV3,
      })
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
      })
      const newSubscription = buildSubscription({
        id: 101,
        plan: SubscriptionPlan.TeamV4,
      })
      const updatedWorkspace = buildWorkspaceDto({
        currentSubscriptionId: 101,
      })

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.ok(currentSubscription),
      )
      mocks.createSubscription.mockResolvedValue(Result.ok(newSubscription))
      mocks.updateWorkspace.mockResolvedValue(Result.ok(updatedWorkspace))
      mocks.issueSubscriptionGrants.mockResolvedValue(Result.ok({}))

      const result = await handleSubscriptionUpdated({
        workspace,
        stripeSubscription,
      })

      expect(result.ok).toBe(true)
      const { subscription } = result.unwrap()
      expect(subscription).toBe(newSubscription)
    })
  })

  describe('plan validation', () => {
    it('returns error when price ID is unknown', async () => {
      const currentSubscription = buildSubscription()
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({
        priceId: 'price_unknown',
      })

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.ok(currentSubscription),
      )

      const result = await handleSubscriptionUpdated({
        workspace,
        stripeSubscription,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain(
        'Could not determine subscription plan',
      )
    })
  })

  describe('event publishing', () => {
    it('publishes subscriptionUpdated event after plan change', async () => {
      const currentSubscription = buildSubscription({
        plan: SubscriptionPlan.TeamV3,
      })
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
      })
      const newSubscription = buildSubscription({
        id: 101,
        plan: SubscriptionPlan.TeamV4,
      })
      const updatedWorkspace = buildWorkspaceDto({
        currentSubscriptionId: 101,
      })

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.ok(currentSubscription),
      )
      mocks.createSubscription.mockResolvedValue(Result.ok(newSubscription))
      mocks.updateWorkspace.mockResolvedValue(Result.ok(updatedWorkspace))
      mocks.issueSubscriptionGrants.mockResolvedValue(Result.ok({}))

      await handleSubscriptionUpdated({ workspace, stripeSubscription })

      await vi.waitFor(() => {
        expect(mocks.publishLater).toHaveBeenCalledWith({
          type: 'subscriptionUpdated',
          data: expect.objectContaining({
            subscription: newSubscription,
            userEmail: 'mock@example.com',
          }),
        })
      })
    })

    it('publishes subscriptionUpdated event when plan is the same', async () => {
      const currentSubscription = buildSubscription({
        plan: SubscriptionPlan.TeamV4,
      })
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
      })

      mocks.subscriptionRepoFind.mockResolvedValue(
        Result.ok(currentSubscription),
      )

      await handleSubscriptionUpdated({ workspace, stripeSubscription })

      await vi.waitFor(() => {
        expect(mocks.publishLater).toHaveBeenCalledWith({
          type: 'subscriptionUpdated',
          data: expect.objectContaining({
            subscription: currentSubscription,
            userEmail: 'mock@example.com',
          }),
        })
      })
    })
  })
})
