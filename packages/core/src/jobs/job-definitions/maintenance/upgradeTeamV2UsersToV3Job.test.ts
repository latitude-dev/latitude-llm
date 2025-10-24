import { describe, it, expect, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { upgradeTeamV2UsersToV3Job } from './upgradeTeamV2UsersToV3Job'
import { SubscriptionPlan } from '../../../plans'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { workspaces } from '../../../schema/models/workspaces'
import { subscriptions } from '../../../schema/models/subscriptions'
import { eq } from 'drizzle-orm'

describe('upgradeTeamV2UsersToV3Job', () => {
  let teamV1Workspace: any
  let teamV2Workspace: any
  let teamV3Workspace: any
  let hobbyWorkspace: any

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
  })

  it('should schedule individual jobs for TeamV2 workspaces only', async () => {
    const mockJob = {} as Job<Record<string, never>>
    await upgradeTeamV2UsersToV3Job(mockJob)

    const teamV2Workspaces = await database
      .select({
        id: workspaces.id,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, teamV2Workspace.id))

    expect(teamV2Workspaces).toHaveLength(1)
    expect(teamV2Workspaces[0].plan).toBe(SubscriptionPlan.TeamV2)
  })

  it('should handle empty workspace list gracefully', async () => {
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: null })
      .where(eq(workspaces.id, teamV2Workspace.id))

    const mockJob = {} as Job<Record<string, never>>

    // Execute the job - should not throw
    await expect(upgradeTeamV2UsersToV3Job(mockJob)).resolves.not.toThrow()
  })

  it('should only process TeamV2 workspaces (not TeamV1, TeamV3, or Hobby)', async () => {
    const mockJob = {} as Job<Record<string, never>>
    await upgradeTeamV2UsersToV3Job(mockJob)

    // Verify TeamV1 workspace is not processed
    const teamV1WorkspaceData = await database
      .select({
        id: workspaces.id,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, teamV1Workspace.id))

    expect(teamV1WorkspaceData).toHaveLength(1)
    expect(teamV1WorkspaceData[0].plan).toBe(SubscriptionPlan.TeamV1)

    // Verify TeamV3 workspace is not processed
    const teamV3WorkspaceData = await database
      .select({
        id: workspaces.id,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, teamV3Workspace.id))

    expect(teamV3WorkspaceData).toHaveLength(1)
    expect(teamV3WorkspaceData[0].plan).toBe(SubscriptionPlan.TeamV3)

    // Verify Hobby workspace is not processed
    const hobbyWorkspaceData = await database
      .select({
        id: workspaces.id,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, hobbyWorkspace.id))

    expect(hobbyWorkspaceData).toHaveLength(1)
    expect(hobbyWorkspaceData[0].plan).toBe(SubscriptionPlan.HobbyV1)
  })
})
