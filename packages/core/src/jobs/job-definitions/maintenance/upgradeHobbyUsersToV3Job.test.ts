import { describe, it, expect, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { upgradeHobbyUsersToV3Job } from './upgradeHobbyUsersToV3Job'
import { SubscriptionPlan } from '../../../plans'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { workspaces } from '../../../schema/models/workspaces'
import { subscriptions } from '../../../schema/models/subscriptions'
import { eq, or } from 'drizzle-orm'
import { Workspace } from '../../../schema/models/types/Workspace'

describe('upgradeHobbyUsersToV3Job', () => {
  let hobbyWorkspace1: Workspace
  let hobbyWorkspace2: Workspace
  let hobbyV3Workspace: Workspace
  let teamWorkspace: Workspace

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
  })

  it('should schedule individual jobs for hobby workspaces', async () => {
    const mockJob = {} as Job<Record<string, never>>
    await upgradeHobbyUsersToV3Job(mockJob)

    const hobbyWorkspaces = await database
      .select({
        id: workspaces.id,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(
        or(
          eq(workspaces.id, hobbyWorkspace1.id),
          eq(workspaces.id, hobbyWorkspace2.id),
        ),
      )

    expect(hobbyWorkspaces).toHaveLength(2)
    expect(hobbyWorkspaces.map((w) => w.plan)).toContain(
      SubscriptionPlan.HobbyV1,
    )
    expect(hobbyWorkspaces.map((w) => w.plan)).toContain(
      SubscriptionPlan.HobbyV2,
    )
  })

  it('should handle empty workspace list gracefully', async () => {
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: null })
      .where(
        or(
          eq(workspaces.id, hobbyWorkspace1.id),
          eq(workspaces.id, hobbyWorkspace2.id),
        ),
      )

    const mockJob = {} as Job<Record<string, never>>

    // Execute the job - should not throw
    await expect(upgradeHobbyUsersToV3Job(mockJob)).resolves.not.toThrow()
  })

  it('should only process hobby workspaces (not HobbyV3 or Team)', async () => {
    const mockJob = {} as Job<Record<string, never>>
    await upgradeHobbyUsersToV3Job(mockJob)

    const hobbyV3WorkspaceData = await database
      .select({
        id: workspaces.id,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, hobbyV3Workspace.id))

    expect(hobbyV3WorkspaceData).toHaveLength(1)
    expect(hobbyV3WorkspaceData[0].plan).toBe(SubscriptionPlan.HobbyV3)

    const teamWorkspaceData = await database
      .select({
        id: workspaces.id,
        plan: subscriptions.plan,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(workspaces.id, teamWorkspace.id))

    expect(teamWorkspaceData).toHaveLength(1)
    expect(teamWorkspaceData[0].plan).toBe(SubscriptionPlan.TeamV1)
  })
})
