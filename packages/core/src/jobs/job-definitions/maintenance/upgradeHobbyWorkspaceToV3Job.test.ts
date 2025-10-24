import { describe, it, expect, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { upgradeHobbyWorkspaceToV3Job } from './upgradeHobbyWorkspaceToV3Job'
import { SubscriptionPlan } from '../../../plans'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { eq } from 'drizzle-orm'
import { Workspace } from '../../../schema/models/types/Workspace'

describe('upgradeHobbyWorkspaceToV3Job', () => {
  let hobbyWorkspace1: Workspace
  let hobbyWorkspace2: Workspace
  let hobbyV3Workspace: Workspace
  let teamWorkspace: Workspace
  let workspaceWithoutSubscription: Workspace

  beforeEach(async () => {
    const { workspace: w1 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      },
    })
    hobbyWorkspace1 = w1

    const { workspace: w2 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV2,
      },
    })
    hobbyWorkspace2 = w2

    const { workspace: w3 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV3,
      },
    })
    hobbyV3Workspace = w3

    const { workspace: w4 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV1,
      },
    })
    teamWorkspace = w4

    const { workspace: w5 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      },
    })
    workspaceWithoutSubscription = w5
  })

  it('should upgrade HobbyV1 workspace to HobbyV3', async () => {
    const mockJob = {
      data: { workspaceId: hobbyWorkspace1.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeHobbyWorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    // Verify the workspace now has HobbyV3 subscription
    const updatedWorkspace = await database
      .select({
        id: workspaces.id,
        currentSubscriptionId: workspaces.currentSubscriptionId,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, hobbyWorkspace1.id))

    expect(updatedWorkspace).toHaveLength(1)
    expect(updatedWorkspace[0].plan).toBe(SubscriptionPlan.HobbyV3)
  })

  it('should upgrade HobbyV2 workspace to HobbyV3', async () => {
    const mockJob = {
      data: { workspaceId: hobbyWorkspace2.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeHobbyWorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    // Verify the workspace now has HobbyV3 subscription
    const updatedWorkspace = await database
      .select({
        id: workspaces.id,
        currentSubscriptionId: workspaces.currentSubscriptionId,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, hobbyWorkspace2.id))

    expect(updatedWorkspace).toHaveLength(1)
    expect(updatedWorkspace[0].plan).toBe(SubscriptionPlan.HobbyV3)
  })

  it('should skip HobbyV3 workspaces', async () => {
    const mockJob = {
      data: { workspaceId: hobbyV3Workspace.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeHobbyWorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()

    // Verify the workspace still has HobbyV3 subscription
    const workspaceData = await database
      .select({
        id: workspaces.id,
        currentSubscriptionId: workspaces.currentSubscriptionId,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, hobbyV3Workspace.id))

    expect(workspaceData).toHaveLength(1)
    expect(workspaceData[0].plan).toBe(SubscriptionPlan.HobbyV3)
  })

  it('should skip non-hobby workspaces', async () => {
    const mockJob = {
      data: { workspaceId: teamWorkspace.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeHobbyWorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()

    // Verify the workspace still has TeamV1 subscription
    const workspaceData = await database
      .select({
        id: workspaces.id,
        currentSubscriptionId: workspaces.currentSubscriptionId,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, teamWorkspace.id))

    expect(workspaceData).toHaveLength(1)
    expect(workspaceData[0].plan).toBe(SubscriptionPlan.TeamV1)
  })

  it('should handle missing workspace', async () => {
    const mockJob = {
      data: { workspaceId: 99999 },
    } as Job<{ workspaceId: number }>

    const result = await upgradeHobbyWorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('should handle workspace without subscription', async () => {
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: null })
      .where(eq(workspaces.id, workspaceWithoutSubscription.id))

    const mockJob = {
      data: { workspaceId: workspaceWithoutSubscription.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeHobbyWorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('should use idempotency to prevent duplicate upgrades', async () => {
    const mockJob = {
      data: { workspaceId: hobbyWorkspace1.id },
    } as Job<{ workspaceId: number }>

    const result1 = await upgradeHobbyWorkspaceToV3Job(mockJob)
    const result2 = await upgradeHobbyWorkspaceToV3Job(mockJob)

    expect(result1.error).toBeUndefined()
    expect(result1.value).toBeDefined()

    // Second call should skip because already upgraded
    expect(result2.error).toBeUndefined()
    expect(result2.value).toBeUndefined()

    // Verify only one HobbyV3 subscription exists
    const subscriptionsInDb = await database
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, hobbyWorkspace1.id))

    const hobbyV3Subscriptions = subscriptionsInDb.filter(
      (s) => s.plan === SubscriptionPlan.HobbyV3,
    )

    expect(hobbyV3Subscriptions).toHaveLength(1)
  })
})
