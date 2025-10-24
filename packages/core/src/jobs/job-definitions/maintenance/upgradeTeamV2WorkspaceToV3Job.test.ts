import { describe, it, expect, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { upgradeTeamV2WorkspaceToV3Job } from './upgradeTeamV2WorkspaceToV3Job'
import { SubscriptionPlan } from '../../../plans'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { eq } from 'drizzle-orm'

describe('upgradeTeamV2WorkspaceToV3Job', () => {
  let teamV1Workspace: any
  let teamV2Workspace: any
  let teamV3Workspace: any
  let hobbyWorkspace: any
  let workspaceWithoutSubscription: any

  beforeEach(async () => {
    const { workspace: w1 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV1,
      },
    })
    teamV1Workspace = w1

    const { workspace: w2 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV2,
      },
    })
    teamV2Workspace = w2

    const { workspace: w3 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV3,
      },
    })
    teamV3Workspace = w3

    const { workspace: w4 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      },
    })
    hobbyWorkspace = w4

    const { workspace: w5 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV2,
      },
    })
    workspaceWithoutSubscription = w5
  })

  it('should upgrade TeamV2 workspace to TeamV3', async () => {
    const mockJob = {
      data: { workspaceId: teamV2Workspace.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeTeamV2WorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    // Verify the workspace now has TeamV3 subscription
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
      .where(eq(workspaces.id, teamV2Workspace.id))

    expect(updatedWorkspace).toHaveLength(1)
    expect(updatedWorkspace[0].plan).toBe(SubscriptionPlan.TeamV3)
  })

  it('should skip TeamV1 workspaces', async () => {
    const mockJob = {
      data: { workspaceId: teamV1Workspace.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeTeamV2WorkspaceToV3Job(mockJob)

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
      .where(eq(workspaces.id, teamV1Workspace.id))

    expect(workspaceData).toHaveLength(1)
    expect(workspaceData[0].plan).toBe(SubscriptionPlan.TeamV1)
  })

  it('should skip TeamV3 workspaces', async () => {
    const mockJob = {
      data: { workspaceId: teamV3Workspace.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeTeamV2WorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()

    // Verify the workspace still has TeamV3 subscription
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
      .where(eq(workspaces.id, teamV3Workspace.id))

    expect(workspaceData).toHaveLength(1)
    expect(workspaceData[0].plan).toBe(SubscriptionPlan.TeamV3)
  })

  it('should skip non-team workspaces', async () => {
    const mockJob = {
      data: { workspaceId: hobbyWorkspace.id },
    } as Job<{ workspaceId: number }>

    const result = await upgradeTeamV2WorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()

    // Verify the workspace still has HobbyV1 subscription
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
      .where(eq(workspaces.id, hobbyWorkspace.id))

    expect(workspaceData).toHaveLength(1)
    expect(workspaceData[0].plan).toBe(SubscriptionPlan.HobbyV1)
  })

  it('should handle missing workspace', async () => {
    const mockJob = {
      data: { workspaceId: 99999 },
    } as Job<{ workspaceId: number }>

    const result = await upgradeTeamV2WorkspaceToV3Job(mockJob)

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

    const result = await upgradeTeamV2WorkspaceToV3Job(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('should use idempotency to prevent duplicate upgrades', async () => {
    const mockJob = {
      data: { workspaceId: teamV2Workspace.id },
    } as Job<{ workspaceId: number }>

    const result1 = await upgradeTeamV2WorkspaceToV3Job(mockJob)
    const result2 = await upgradeTeamV2WorkspaceToV3Job(mockJob)

    expect(result1.error).toBeUndefined()
    expect(result1.value).toBeDefined()

    // Second call should skip because already upgraded
    expect(result2.error).toBeUndefined()
    expect(result2.value).toBeUndefined()

    // Verify only one TeamV3 subscription exists
    const subscriptionsInDb = await database
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, teamV2Workspace.id))

    const teamV3Subscriptions = subscriptionsInDb.filter(
      (s) => s.plan === SubscriptionPlan.TeamV3,
    )

    expect(teamV3Subscriptions).toHaveLength(1)
  })
})
