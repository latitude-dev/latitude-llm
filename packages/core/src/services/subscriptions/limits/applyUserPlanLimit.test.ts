import { PaymentRequiredError } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'
import { FREE_PLANS, PRO_PLANS, SubscriptionPlan } from '../../../plans'
import { type Subscription } from '../../../schema/models/types/Subscription'
import { type Workspace } from '../../../schema/models/types/Workspace'
import {
  createMembership,
  createSubscription,
  createUser,
  createWorkspace,
} from '../../../tests/factories'
import { applyUserPlanLimit } from './applyUserPlanLimit'
import { type User } from '../../../schema/models/types/User'

describe('applyUserPlanLimit', () => {
  let workspace: Workspace & { currentSubscription: Subscription }
  let creatorUser: User

  beforeEach(async () => {
    // Create a test workspace with HobbyV3 plan (2 users limit)
    const result = await createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV3,
    })
    const subscription = await createSubscription({
      workspaceId: result.workspace.id,
      plan: SubscriptionPlan.HobbyV3,
    })

    workspace = {
      ...result.workspace,
      currentSubscription: subscription,
    }
    creatorUser = result.userData
  })

  it('returns nil when no subscription exists', async () => {
    // Arrange
    const workspaceWithoutSubscription = {
      ...workspace,
      currentSubscriptionId: null as any,
    }
    delete (workspaceWithoutSubscription as any).currentSubscription

    // Act
    const result = await applyUserPlanLimit({
      workspace: workspaceWithoutSubscription,
    })

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it('returns nil when subscription is not free or pro plan', async () => {
    // Arrange
    const teamWorkspace = {
      ...workspace,
      currentSubscription: {
        ...workspace.currentSubscription,
        plan: SubscriptionPlan.TeamV3,
      },
    }

    // Act
    const result = await applyUserPlanLimit({
      workspace: teamWorkspace,
    })

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it('returns PaymentRequiredError when users reach limit', async () => {
    // Arrange - for HobbyV3, limit is 2 users, and creator already counts as 1
    // So having exactly 2 users (the creator and a new user) should trigger the error
    const user = await createUser()
    await createMembership({ user, workspace, author: creatorUser })

    // Act
    const result = await applyUserPlanLimit({ workspace })

    // Assert
    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(PaymentRequiredError)
    expect((result.error as PaymentRequiredError).message).toContain(
      'You have reached the maximum number of users allowed for this plan',
    )
  })

  it('returns PaymentRequiredError when users exceed limit', async () => {
    // Arrange - create 3 additional users (creator + 2 = 3 users > limit of 2 for HobbyV3)
    const user = await createUser()
    await createMembership({ user, workspace, author: creatorUser })
    const user2 = await createUser()
    await createMembership({ user: user2, workspace, author: creatorUser })

    // Act
    const result = await applyUserPlanLimit({ workspace })

    // Assert
    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(PaymentRequiredError)
    expect((result.error as PaymentRequiredError).message).toContain(
      'You have reached the maximum number of users allowed for this plan',
    )
  })

  describe('different subscription plans', () => {
    it.each(FREE_PLANS.filter((plan) => plan !== SubscriptionPlan.HobbyV3))(
      'works with free plan: %s',
      async (plan) => {
        // Arrange
        const result = await createWorkspace({
          subscriptionPlan: plan,
        })
        const subscription = await createSubscription({
          workspaceId: result.workspace.id,
          plan,
        })
        const workspaceWithPlan = {
          ...result.workspace,
          currentSubscription: subscription,
        }

        // For free plans with 1 user limit, having 1 user should return error
        // Act
        const result2 = await applyUserPlanLimit({
          workspace: workspaceWithPlan,
        })

        // Assert
        expect(result2.ok).toBe(false)
        expect(result2.error).toBeInstanceOf(PaymentRequiredError)
      },
    )

    it.each(PRO_PLANS)('works with pro plan: %s', async (plan) => {
      // Arrange
      const result = await createWorkspace({
        subscriptionPlan: plan,
      })
      const subscription = await createSubscription({
        workspaceId: result.workspace.id,
        plan,
      })
      const workspaceWithPlan = {
        ...result.workspace,
        currentSubscription: subscription,
      }

      // For pro plans with 1 user limit, having 1 user should return error
      // Act
      const result2 = await applyUserPlanLimit({
        workspace: workspaceWithPlan,
      })

      // Assert
      expect(result2.ok).toBe(false)
      expect(result2.error).toBeInstanceOf(PaymentRequiredError)
    })
  })

  // Note: The following edge cases are tested in a separate file to avoid
  // global mock interference with the factory-based tests above
  // - Quota computation returns null
  // - Quota limit is 'unlimited'
  // - Quota computation failure
})
