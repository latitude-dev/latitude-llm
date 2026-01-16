import Stripe from 'stripe'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../lib/Result'
import { SubscriptionPlan } from '../../plans'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { createWorkspace as createWorkspaceFactory } from '../../tests/factories'

const mocks = vi.hoisted(() => ({
  handleSubscriptionCreated: vi.fn(),
  handleSubscriptionUpdated: vi.fn(),
}))

vi.mock('./handleSubscriptionCreated', () => ({
  handleSubscriptionCreated: mocks.handleSubscriptionCreated,
}))

vi.mock('./handleSubscriptionUpdated', () => ({
  handleSubscriptionUpdated: mocks.handleSubscriptionUpdated,
}))

import { handleSubscriptionUpdatedOrCreated } from './handleSubscriptionUpdatedOrCreated'

const STRIPE_CUSTOMER_ID = 'cus_test_workspace'

function buildStripeSubscription({
  customerId = 'cus_test123',
}: {
  customerId?: string
} = {}): Stripe.Subscription {
  return {
    id: 'sub_test123',
    object: 'subscription',
    status: 'active',
    customer: customerId,
    metadata: {},
    items: {
      object: 'list',
      data: [],
      has_more: false,
      url: '/v1/subscription_items',
    },
  } as unknown as Stripe.Subscription
}

describe('handleSubscriptionUpdatedOrCreated', () => {
  let workspace: WorkspaceDto

  beforeAll(async () => {
    const result = await createWorkspaceFactory({
      subscriptionPlan: SubscriptionPlan.TeamV4,
      stripeCustomerId: STRIPE_CUSTOMER_ID,
    })
    workspace = result.workspace
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handleSubscriptionUpdated.mockResolvedValue(Result.ok({}))
    mocks.handleSubscriptionCreated.mockResolvedValue(Result.ok({}))
  })

  describe('when workspace is found for stripeCustomerId', () => {
    it('calls handleSubscriptionUpdated', async () => {
      const stripeSubscription = buildStripeSubscription({
        customerId: STRIPE_CUSTOMER_ID,
      })

      await handleSubscriptionUpdatedOrCreated({ stripeSubscription })

      expect(mocks.handleSubscriptionUpdated).toHaveBeenCalledWith({
        workspace: expect.objectContaining({ id: workspace.id }),
        stripeSubscription,
      })
      expect(mocks.handleSubscriptionCreated).not.toHaveBeenCalled()
    })
  })

  describe('when workspace is not found for stripeCustomerId', () => {
    it('calls handleSubscriptionCreated', async () => {
      const stripeSubscription = buildStripeSubscription()

      await handleSubscriptionUpdatedOrCreated({ stripeSubscription })

      expect(mocks.handleSubscriptionCreated).toHaveBeenCalledWith({
        stripeSubscription,
      })
      expect(mocks.handleSubscriptionUpdated).not.toHaveBeenCalled()
    })
  })
})
