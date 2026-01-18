import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../lib/Result'
import { SubscriptionPlan } from '../../plans'
import { WorkspaceDto } from '../../schema/models/types/Workspace'

const mocks = vi.hoisted(() => ({
  unsafelyFindWorkspaceByStripeCustomerId: vi.fn(),
  handleSubscriptionCreated: vi.fn(),
  handleSubscriptionUpdated: vi.fn(),
}))

vi.mock('../../data-access/workspaces', () => ({
  unsafelyFindWorkspaceByStripeCustomerId:
    mocks.unsafelyFindWorkspaceByStripeCustomerId,
}))

vi.mock('./handleSubscriptionCreated', () => ({
  handleSubscriptionCreated: mocks.handleSubscriptionCreated,
}))

vi.mock('./handleSubscriptionUpdated', () => ({
  handleSubscriptionUpdated: mocks.handleSubscriptionUpdated,
}))

import { handleSubscriptionUpdatedOrCreated } from './handleSubscriptionUpdatedOrCreated'

function buildStripeSubscription({
  customerId = 'cus_test123',
  status = 'active',
}: {
  customerId?: string
  status?: Stripe.Subscription.Status
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
          price: { id: 'price_test', object: 'price' } as Stripe.Price,
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
    stripeCustomerId: 'cus_existing',
    currentSubscriptionId: 1,
    creatorId: 'user-123',
    defaultProviderId: null,
    issuesUnlocked: false,
    isBigAccount: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    hasBillingPortal: true,
    currentSubscription: {
      id: 1,
      plan: SubscriptionPlan.TeamV4,
      workspaceId: 1,
      trialEndsAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  } as WorkspaceDto
}

describe('handleSubscriptionUpdatedOrCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when workspace exists for stripe customer', () => {
    it('should call handleSubscriptionUpdated', async () => {
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription({
        customerId: 'cus_existing',
      })

      mocks.unsafelyFindWorkspaceByStripeCustomerId.mockResolvedValue(workspace)
      mocks.handleSubscriptionUpdated.mockResolvedValue(
        Result.ok({ workspace, subscription: workspace.currentSubscription }),
      )

      await handleSubscriptionUpdatedOrCreated({ stripeSubscription })

      expect(
        mocks.unsafelyFindWorkspaceByStripeCustomerId,
      ).toHaveBeenCalledWith('cus_existing')
      expect(mocks.handleSubscriptionUpdated).toHaveBeenCalledWith({
        workspace,
        stripeSubscription,
      })
      expect(mocks.handleSubscriptionCreated).not.toHaveBeenCalled()
    })

    it('should return the result from handleSubscriptionUpdated', async () => {
      const workspace = buildWorkspaceDto()
      const stripeSubscription = buildStripeSubscription()
      const expectedResult = Result.ok({
        workspace,
        subscription: workspace.currentSubscription,
      })

      mocks.unsafelyFindWorkspaceByStripeCustomerId.mockResolvedValue(workspace)
      mocks.handleSubscriptionUpdated.mockResolvedValue(expectedResult)

      const result = await handleSubscriptionUpdatedOrCreated({
        stripeSubscription,
      })

      expect(result).toBe(expectedResult)
    })
  })

  describe('when workspace does not exist for stripe customer', () => {
    it('should call handleSubscriptionCreated', async () => {
      const stripeSubscription = buildStripeSubscription({
        customerId: 'cus_new_customer',
      })

      mocks.unsafelyFindWorkspaceByStripeCustomerId.mockResolvedValue(undefined)
      mocks.handleSubscriptionCreated.mockResolvedValue(
        Result.ok({ workspace: buildWorkspaceDto(), subscription: null }),
      )

      await handleSubscriptionUpdatedOrCreated({ stripeSubscription })

      expect(
        mocks.unsafelyFindWorkspaceByStripeCustomerId,
      ).toHaveBeenCalledWith('cus_new_customer')
      expect(mocks.handleSubscriptionCreated).toHaveBeenCalledWith({
        stripeSubscription,
      })
      expect(mocks.handleSubscriptionUpdated).not.toHaveBeenCalled()
    })

    it('should return the result from handleSubscriptionCreated', async () => {
      const stripeSubscription = buildStripeSubscription()
      const expectedResult = Result.ok({
        workspace: buildWorkspaceDto(),
        subscription: null,
      })

      mocks.unsafelyFindWorkspaceByStripeCustomerId.mockResolvedValue(undefined)
      mocks.handleSubscriptionCreated.mockResolvedValue(expectedResult)

      const result = await handleSubscriptionUpdatedOrCreated({
        stripeSubscription,
      })

      expect(result).toBe(expectedResult)
    })

    it('should call handleSubscriptionCreated when workspace is null', async () => {
      const stripeSubscription = buildStripeSubscription()

      mocks.unsafelyFindWorkspaceByStripeCustomerId.mockResolvedValue(null)
      mocks.handleSubscriptionCreated.mockResolvedValue(
        Result.ok({ workspace: buildWorkspaceDto(), subscription: null }),
      )

      await handleSubscriptionUpdatedOrCreated({ stripeSubscription })

      expect(mocks.handleSubscriptionCreated).toHaveBeenCalledWith({
        stripeSubscription,
      })
      expect(mocks.handleSubscriptionUpdated).not.toHaveBeenCalled()
    })
  })

  describe('stripe customer ID extraction', () => {
    it('should extract customer ID from string', async () => {
      const stripeSubscription = buildStripeSubscription({
        customerId: 'cus_string_id',
      })

      mocks.unsafelyFindWorkspaceByStripeCustomerId.mockResolvedValue(undefined)
      mocks.handleSubscriptionCreated.mockResolvedValue(Result.ok({}))

      await handleSubscriptionUpdatedOrCreated({ stripeSubscription })

      expect(
        mocks.unsafelyFindWorkspaceByStripeCustomerId,
      ).toHaveBeenCalledWith('cus_string_id')
    })

    it('should extract customer ID from Stripe.Customer object', async () => {
      const stripeSubscription = {
        ...buildStripeSubscription(),
        customer: {
          id: 'cus_object_id',
          object: 'customer',
        } as Stripe.Customer,
      } as Stripe.Subscription

      mocks.unsafelyFindWorkspaceByStripeCustomerId.mockResolvedValue(undefined)
      mocks.handleSubscriptionCreated.mockResolvedValue(Result.ok({}))

      await handleSubscriptionUpdatedOrCreated({ stripeSubscription })

      expect(
        mocks.unsafelyFindWorkspaceByStripeCustomerId,
      ).toHaveBeenCalledWith('cus_object_id')
    })
  })
})
