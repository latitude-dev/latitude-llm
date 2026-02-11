import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingError } from '@latitude-data/constants/errors'
import { QuotaType } from '../../constants'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import { createWorkspace as createWorkspaceFactory } from '../../tests/factories'
import { computeQuota } from '../grants/quota'
import { handleSubscriptionCreated } from './handleSubscriptionCreated'
import * as userDataAccess from '../../queries/users/findFirstInWorkspace'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { publisher } from '../../events/publisher'
import { User } from '../../schema/models/types/User'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

function buildStripeSubscription({
  workspaceId,
  customerId = 'cus_test123',
  status = 'active',
  priceId = SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
}: {
  workspaceId?: number
  customerId?: string
  status?: Stripe.Subscription.Status
  priceId?: string
}): Stripe.Subscription {
  return {
    id: 'sub_test123',
    object: 'subscription',
    status,
    customer: customerId,
    metadata: workspaceId ? { workspaceId: String(workspaceId) } : {},
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test123',
          object: 'subscription_item',
          price: {
            id: priceId,
            object: 'price',
          } as Stripe.Price,
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: '/v1/subscription_items',
    },
  } as Stripe.Subscription
}

describe('handleSubscriptionCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(publisher.publishLater).mockImplementation(() =>
      Promise.resolve(),
    )
    vi.spyOn(userDataAccess, 'findFirstUserInWorkspace').mockResolvedValue({
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
    } as User)
  })

  describe('successful subscription creation', () => {
    it('creates subscription and links stripe customer to workspace', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        customerId: 'cus_new_customer',
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(true)
      const { workspace: updatedWorkspace, subscription } = result.unwrap()

      expect(updatedWorkspace.stripeCustomerId).toBe('cus_new_customer')
      expect(subscription).not.toBeNull()
      expect(subscription!.plan).toBe(SubscriptionPlan.TeamV4)
      expect(updatedWorkspace.currentSubscriptionId).toBe(subscription!.id)
    })

    it('issues correct grants for TeamV4 plan', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })
      expect(result.ok).toBe(true)

      const { workspace: updatedWorkspace } = result.unwrap()

      const seatsQuota = await computeQuota({
        type: QuotaType.Seats,
        workspace: updatedWorkspace,
      }).then((r) => r.unwrap())

      const runsQuota = await computeQuota({
        type: QuotaType.Runs,
        workspace: updatedWorkspace,
      }).then((r) => r.unwrap())

      const creditsQuota = await computeQuota({
        type: QuotaType.Credits,
        workspace: updatedWorkspace,
      }).then((r) => r.unwrap())

      const teamV4Plan = SubscriptionPlans[SubscriptionPlan.TeamV4]
      expect(seatsQuota.limit).toBe(teamV4Plan.users)
      expect(runsQuota.limit).toBe(teamV4Plan.credits)
      expect(creditsQuota.limit).toBe(teamV4Plan.latte_credits)
    })

    it('updates quotas from hobby plan to team plan', async () => {
      const { workspace } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
      })

      const hobbySeatsQuota = await computeQuota({
        type: QuotaType.Seats,
        workspace,
      }).then((r) => r.unwrap())
      expect(hobbySeatsQuota.limit).toBe(
        SubscriptionPlans[SubscriptionPlan.HobbyV3].users,
      )

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })
      const { workspace: updatedWorkspace } = result.unwrap()

      const teamSeatsQuota = await computeQuota({
        type: QuotaType.Seats,
        workspace: updatedWorkspace,
      }).then((r) => r.unwrap())

      expect(teamSeatsQuota.limit).toBe(
        SubscriptionPlans[SubscriptionPlan.TeamV4].users,
      )
    })

    it('creates subscription for TeamV3 plan', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV3].stripePriceId,
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(true)
      const { subscription } = result.unwrap()
      expect(subscription!.plan).toBe(SubscriptionPlan.TeamV3)
    })

    it('handles customer as Stripe.Customer object', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = {
        ...buildStripeSubscription({ workspaceId: workspace.id }),
        customer: {
          id: 'cus_expanded_customer',
          object: 'customer',
        } as Stripe.Customer,
      } as Stripe.Subscription

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(true)
      const { workspace: updatedWorkspace } = result.unwrap()
      expect(updatedWorkspace.stripeCustomerId).toBe('cus_expanded_customer')
    })

    it('publishes subscriptionUpdated event after successful creation', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
      })

      await handleSubscriptionCreated({ stripeSubscription })

      await vi.waitFor(() => {
        expect(publisher.publishLater).toHaveBeenCalledWith({
          type: 'subscriptionUpdated',
          data: expect.objectContaining({
            workspace: expect.objectContaining({ id: workspace.id }),
            subscription: expect.objectContaining({
              plan: SubscriptionPlan.TeamV4,
            }),
            userEmail: 'mock@example.com',
          }),
        })
      })
    })
  })

  describe('error cases', () => {
    it('returns error when workspaceId is missing from metadata', async () => {
      const stripeSubscription = buildStripeSubscription({
        workspaceId: undefined,
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain(
        'Subscription metadata is missing workspaceId',
      )
    })

    it('returns error when workspace does not exist', async () => {
      const stripeSubscription = buildStripeSubscription({
        workspaceId: 999999,
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('Workspace 999999 not found')
    })

    it('returns error when subscription status is not active', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        status: 'incomplete',
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('is not active')
    })

    it('returns error when subscription status is past_due', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        status: 'past_due',
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('is not active')
    })

    it('returns error when subscription status is canceled', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        status: 'canceled',
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain('is not active')
    })

    it('returns error when price ID is unknown', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        priceId: 'price_unknown_plan',
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain(
        'Could not determine subscription plan',
      )
    })

    it('returns error when subscription has no items', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = {
        ...buildStripeSubscription({ workspaceId: workspace.id }),
        items: {
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/subscription_items',
        },
      } as Stripe.Subscription

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(BillingError)
      expect(result.error!.message).toContain(
        'Could not determine subscription plan',
      )
    })
  })

  describe('race condition handling', () => {
    it('delegates to handleSubscriptionUpdated when workspace already has stripeCustomerId', async () => {
      const { workspace } = await createWorkspaceFactory({
        stripeCustomerId: 'cus_already_assigned',
      })
      const originalSubscriptionId = workspace.currentSubscriptionId

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        customerId: 'cus_already_assigned',
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(true)
      const { workspace: updatedWorkspace, subscription } = result.unwrap()

      expect(updatedWorkspace.stripeCustomerId).toBe('cus_already_assigned')
      expect(subscription).not.toBeNull()
      expect(subscription!.plan).toBe(SubscriptionPlan.TeamV4)
      expect(updatedWorkspace.currentSubscriptionId).toBe(subscription!.id)
      expect(updatedWorkspace.currentSubscriptionId).not.toBe(
        originalSubscriptionId,
      )
    })

    it('handles concurrent webhook race by not creating duplicate subscriptions', async () => {
      const { workspace } = await createWorkspaceFactory({
        stripeCustomerId: 'cus_concurrent',
        subscriptionPlan: SubscriptionPlan.TeamV4,
      })
      const originalSubscription = workspace.currentSubscriptionId

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        customerId: 'cus_concurrent',
        priceId: SubscriptionPlans[SubscriptionPlan.TeamV4].stripePriceId,
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })

      expect(result.ok).toBe(true)
      const { subscription } = result.unwrap()

      expect(subscription!.id).toBe(originalSubscription)
    })
  })

  describe('database state after successful creation', () => {
    it('persists workspace stripe customer id', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
        customerId: 'cus_persisted',
      })

      await handleSubscriptionCreated({ stripeSubscription })

      const persistedWorkspace = await unsafelyFindWorkspace(workspace.id)
      expect(persistedWorkspace.stripeCustomerId).toBe('cus_persisted')
    })

    it('persists new subscription as current subscription', async () => {
      const { workspace } = await createWorkspaceFactory()
      const originalSubscriptionId = workspace.currentSubscriptionId

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })
      const { subscription } = result.unwrap()

      const persistedWorkspace = await unsafelyFindWorkspace(workspace.id)
      expect(persistedWorkspace!.currentSubscriptionId).toBe(subscription!.id)
      expect(persistedWorkspace!.currentSubscriptionId).not.toBe(
        originalSubscriptionId,
      )
    })

    it('new subscription has no trial end date for paid plans', async () => {
      const { workspace } = await createWorkspaceFactory()

      const stripeSubscription = buildStripeSubscription({
        workspaceId: workspace.id,
      })

      const result = await handleSubscriptionCreated({ stripeSubscription })
      const { subscription } = result.unwrap()

      expect(subscription!.trialEndsAt).toBeNull()
    })
  })
})
