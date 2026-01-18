import Stripe from 'stripe'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingError } from '@latitude-data/constants/errors'
import { SubscriptionPlan } from '../../plans'
import { SubscriptionRepository } from '../../repositories'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { createWorkspace as createWorkspaceFactory } from '../../tests/factories'
import { handleSubscriptionCancelled } from './handleSubscriptionCancelled'
import { publisher } from '../../events/publisher'
import * as usersDataAccess from '../../data-access/users'
import { User } from '../../schema/models/types/User'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

const STRIPE_CUSTOMER_ID = 'cus_test_workspace'

function buildStripeSubscription({
  customerId = STRIPE_CUSTOMER_ID,
  currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
}: {
  customerId?: string
  currentPeriodEnd?: number
} = {}): Stripe.Subscription {
  return {
    id: 'sub_test123',
    object: 'subscription',
    status: 'canceled',
    customer: customerId,
    current_period_end: currentPeriodEnd,
    metadata: {},
    items: {
      object: 'list',
      data: [],
      has_more: false,
      url: '/v1/subscription_items',
    },
  } as unknown as Stripe.Subscription
}

describe('handleSubscriptionCancelled', () => {
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
    vi.mocked(publisher.publishLater).mockImplementation(() =>
      Promise.resolve(),
    )
    vi.spyOn(usersDataAccess, 'findFirstUserInWorkspace').mockResolvedValue({
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
    } as User)
  })

  describe('successful cancellation', () => {
    it('marks subscription as cancelled with cancelledAt from current_period_end', async () => {
      const currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
      const stripeSubscription = buildStripeSubscription({ currentPeriodEnd })

      const result = await handleSubscriptionCancelled({ stripeSubscription })

      expect(result.ok).toBe(true)
      const cancelledSubscription = result.unwrap()
      expect(cancelledSubscription.cancelledAt).toEqual(
        new Date(currentPeriodEnd * 1000),
      )
    })

    it('cancels the current workspace subscription', async () => {
      const stripeSubscription = buildStripeSubscription()

      const result = await handleSubscriptionCancelled({ stripeSubscription })

      expect(result.ok).toBe(true)
      const cancelledSubscription = result.unwrap()
      expect(cancelledSubscription.id).toBe(workspace.currentSubscriptionId)
    })

    it('persists cancellation to database and returns updated subscription', async () => {
      const currentPeriodEnd = Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60
      const stripeSubscription = buildStripeSubscription({ currentPeriodEnd })

      const result = await handleSubscriptionCancelled({ stripeSubscription })
      const returnedSubscription = result.unwrap()

      const subscriptionRepo = new SubscriptionRepository(workspace.id)
      const persistedSubscription = await subscriptionRepo
        .find(workspace.currentSubscriptionId)
        .then((r) => r.unwrap())

      expect(returnedSubscription).toEqual(persistedSubscription)
      expect(persistedSubscription.cancelledAt).toEqual(
        new Date(currentPeriodEnd * 1000),
      )
    })

    it('handles customer as Stripe.Customer object', async () => {
      const stripeSubscription = {
        ...buildStripeSubscription(),
        customer: {
          id: STRIPE_CUSTOMER_ID,
          object: 'customer',
        } as Stripe.Customer,
      } as unknown as Stripe.Subscription

      const result = await handleSubscriptionCancelled({ stripeSubscription })

      expect(result.ok).toBe(true)
    })

    it('publishes subscriptionEnqueuedForCancellation event', async () => {
      const currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
      const stripeSubscription = buildStripeSubscription({ currentPeriodEnd })

      await handleSubscriptionCancelled({ stripeSubscription })

      await vi.waitFor(() => {
        expect(publisher.publishLater).toHaveBeenCalledWith({
          type: 'subscriptionEnqueuedForCancellation',
          data: expect.objectContaining({
            workspaceId: workspace.id,
            stripeCustomerId: STRIPE_CUSTOMER_ID,
            cancellationDate: new Date(currentPeriodEnd * 1000).toISOString(),
            userEmail: 'mock@example.com',
          }),
        })
      })
    })
  })

  describe('error cases', () => {
    it('throws BillingError when workspace is not found by stripeCustomerId', async () => {
      const stripeSubscription = buildStripeSubscription({
        customerId: 'cus_nonexistent',
      })

      await expect(
        handleSubscriptionCancelled({ stripeSubscription }),
      ).rejects.toThrow(BillingError)

      await expect(
        handleSubscriptionCancelled({ stripeSubscription }),
      ).rejects.toThrow(
        'No workspace found with stripeCustomerId cus_nonexistent',
      )
    })

    it('throws BillingError when current subscription is not found', async () => {
      const stripeCustomerId = 'cus_no_subscription'
      const { workspace: workspaceWithNoSub } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.TeamV4,
        stripeCustomerId,
      })

      const workspacesDataAccess = await import('../../data-access/workspaces')
      vi.spyOn(
        workspacesDataAccess,
        'unsafelyFindWorkspaceByStripeCustomerId',
      ).mockResolvedValue({
        ...workspaceWithNoSub,
        currentSubscriptionId: 999999,
      })

      const stripeSubscription = buildStripeSubscription({
        customerId: stripeCustomerId,
      })

      await expect(
        handleSubscriptionCancelled({ stripeSubscription }),
      ).rejects.toThrow(BillingError)

      await expect(
        handleSubscriptionCancelled({ stripeSubscription }),
      ).rejects.toThrow(
        `Failed to retrieve current subscription for workspace ${workspaceWithNoSub.id}`,
      )

      vi.mocked(
        workspacesDataAccess.unsafelyFindWorkspaceByStripeCustomerId,
      ).mockRestore()
    })
  })
})
