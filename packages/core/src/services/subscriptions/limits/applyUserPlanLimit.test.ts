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

describe('applyUserPlanLimit', () => {
  let workspace: Workspace & { currentSubscription: Subscription }
  let creatorUser: any

  beforeEach(async () => {
    // Create a test workspace with HobbyV2 plan (1 user limit)
    const result = await createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV2,
    })
    const subscription = await createSubscription({
      workspaceId: result.workspace.id,
      plan: SubscriptionPlan.HobbyV2,
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
        plan: SubscriptionPlan.TeamV1,
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
    // Arrange - for HobbyV2, limit is 1 user, and creator already counts as 1
    // So having exactly 1 user (just the creator) should trigger the error

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
    // Arrange - create 1 additional user (creator + 1 = 2 users > limit of 1 for HobbyV2)
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

  describe('different subscription plans', () => {
    it.each(FREE_PLANS)('works with free plan: %s', async (plan) => {
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
    })

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
