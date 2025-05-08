import { describe, it, expect, vi, beforeEach } from 'vitest'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { handleSubscriptionUpdate } from './handleSubscriptionUpdate'
import {
  createUser,
  createSubscription,
  createProject,
} from '../../tests/factories'
import { workspaces } from '../../schema/models/workspaces'
import { SubscriptionPlan } from '../../plans'
import { LatitudeError } from '../../lib/errors'
import { User, Workspace } from '../../browser'

const mockStripe = {
  customers: {
    retrieve: vi.fn(),
  },
  // Add other Stripe methods if they become necessary for this service
} as unknown as Stripe

vi.mock('stripe', () => ({
  default: vi.fn(() => mockStripe),
  Stripe: vi.fn(() => mockStripe), // Handle both default and named exports if necessary
}))

describe('handleSubscriptionUpdate', () => {
  let testWorkspace: Workspace
  let testUser: User
  let initialStripeSubscription: Partial<Stripe.Subscription>

  beforeEach(async () => {
    const { workspace, user } = await createProject({
      name: 'Test Workspace',
    })
    testWorkspace = workspace
    testUser = user

    initialStripeSubscription = {
      id: 'sub_test123',
      customer: 'cus_test123',
      status: 'active',
      items: {
        data: [
          {
            id: 'si_test123',
            price: { id: 'price_team_v1', product: 'prod_team_v1' },
          } as Stripe.SubscriptionItem,
        ],
        has_more: false,
        object: 'list',
        url: 'https://api.stripe.com/v1/subscription_items',
      },
      cancel_at_period_end: false,
    }

    // @ts-expect-error - mocked value
    mockStripe.customers.retrieve.mockResolvedValue({
      id: 'cus_test123',
      email: testUser.email,
      deleted: false,
    } as Stripe.Customer)
  })

  it('should create a new TeamV1 subscription if none exists and Stripe sub is active', async () => {
    const result = await handleSubscriptionUpdate({
      stripeSubscription: initialStripeSubscription as Stripe.Subscription,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error

    const { workspace, subscription } = result.value!
    expect(workspace.id).toBe(testWorkspace.id)
    expect(workspace.currentSubscriptionId).toBe(subscription.id)
    expect(subscription.plan).toBe(SubscriptionPlan.TeamV1)
    expect(subscription.workspaceId).toBe(testWorkspace.id)
  })

  it('should upgrade an existing non-TeamV1 subscription to TeamV1', async () => {
    const oldSub = await createSubscription({
      workspaceId: testWorkspace.id,
      plan: SubscriptionPlan.HobbyV1, // Different plan
    })
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: oldSub.id })
      .where(eq(workspaces.id, testWorkspace.id))

    const result = await handleSubscriptionUpdate({
      stripeSubscription: initialStripeSubscription as Stripe.Subscription,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error

    const { workspace, subscription: newSubscription } = result.value!
    expect(workspace.currentSubscriptionId).toBe(newSubscription.id)
    expect(newSubscription.plan).toBe(SubscriptionPlan.TeamV1)
    expect(newSubscription.id).not.toBe(oldSub.id)
  })

  it('should do nothing if a TeamV1 subscription already exists and Stripe sub is active', async () => {
    const existingTeamSub = await createSubscription({
      workspaceId: testWorkspace.id,
      plan: SubscriptionPlan.TeamV1,
    })
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: existingTeamSub.id })
      .where(eq(workspaces.id, testWorkspace.id))

    const result = await handleSubscriptionUpdate({
      stripeSubscription: initialStripeSubscription as Stripe.Subscription,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error

    const { workspace, subscription } = result.value!
    expect(workspace.currentSubscriptionId).toBe(existingTeamSub.id)
    expect(subscription.id).toBe(existingTeamSub.id)
    expect(subscription.plan).toBe(SubscriptionPlan.TeamV1)
  })

  it('should do nothing if Stripe subscription is not active', async () => {
    const nonActiveStripeSub = {
      ...initialStripeSubscription,
      status: 'past_due',
    } as Stripe.Subscription

    const result = await handleSubscriptionUpdate({
      stripeSubscription: nonActiveStripeSub,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error

    const { subscription } = result.value!
    expect(subscription.plan).not.toBe(SubscriptionPlan.TeamV1)
  })

  it('should throw LatitudeError if Stripe customer ID is not a string', async () => {
    const badStripeSub = {
      ...initialStripeSubscription,
      customer: { id: 'cus_123' },
    } as any
    const result = await handleSubscriptionUpdate({
      stripeSubscription: badStripeSub,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe('Stripe customer ID is not a string.')
  })

  it('should throw LatitudeError if Stripe customer is deleted', async () => {
    // @ts-expect-error - mocked value
    mockStripe.customers.retrieve.mockResolvedValueOnce({
      deleted: true,
    } as any)
    const result = await handleSubscriptionUpdate({
      stripeSubscription: initialStripeSubscription as Stripe.Subscription,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe('Stripe customer has been deleted.')
  })

  it('should throw LatitudeError if Stripe customer has no email', async () => {
    // @ts-expect-error - mocked value
    mockStripe.customers.retrieve.mockResolvedValueOnce({ email: null } as any)
    const result = await handleSubscriptionUpdate({
      stripeSubscription: initialStripeSubscription as Stripe.Subscription,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe(
      'Stripe customer does not have an email.',
    )
  })

  it('should throw LatitudeError if user not found in DB', async () => {
    // @ts-expect-error - mocked value
    mockStripe.customers.retrieve.mockResolvedValueOnce({
      email: 'wat@example.com',
    } as any)
    const result = await handleSubscriptionUpdate({
      stripeSubscription: initialStripeSubscription as Stripe.Subscription,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe(
      `User with email wat@example.com not found.`,
    )
  })

  it('should throw LatitudeError if no workspace found for user (via membership)', async () => {
    const userWithNoWorkspace = await createUser({
      email: 'lonely@example.com',
    })
    // @ts-expect-error - mocked value
    mockStripe.customers.retrieve.mockResolvedValueOnce({
      email: userWithNoWorkspace.email,
    } as any)

    const result = await handleSubscriptionUpdate({
      stripeSubscription: initialStripeSubscription as Stripe.Subscription,
      stripe: mockStripe,
    })

    expect(result.ok).toBe(false)

    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe(
      `No workspace found for user ${userWithNoWorkspace.id}.`,
    )
  })
})
