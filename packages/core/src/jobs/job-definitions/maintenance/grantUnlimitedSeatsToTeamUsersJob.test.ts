import { describe, it, expect, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { grantUnlimitedSeatsToTeamUsersJob } from './grantUnlimitedSeatsToTeamUsersJob'
import { SubscriptionPlan } from '../../../plans'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { workspaces } from '../../../schema/models/workspaces'
import { subscriptions } from '../../../schema/models/subscriptions'
import { eq, or } from 'drizzle-orm'

describe('grantUnlimitedSeatsToTeamUsersJob', () => {
  let teamWorkspace1: any
  let teamWorkspace2: any
  let hobbyWorkspace: any

  beforeEach(async () => {
    const { workspace: w1 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV1,
      },
    })
    teamWorkspace1 = w1

    const { workspace: w2 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV2,
      },
    })
    teamWorkspace2 = w2

    const { workspace: w3 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      },
    })
    hobbyWorkspace = w3
  })

  it('should schedule individual jobs for team workspaces', async () => {
    const mockJob = {} as Job<Record<string, never>>
    await grantUnlimitedSeatsToTeamUsersJob(mockJob)

    const teamWorkspaces = await database
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
          eq(workspaces.id, teamWorkspace1.id),
          eq(workspaces.id, teamWorkspace2.id),
        ),
      )

    expect(teamWorkspaces).toHaveLength(2)
    expect(teamWorkspaces.map((w) => w.plan)).toContain(SubscriptionPlan.TeamV1)
    expect(teamWorkspaces.map((w) => w.plan)).toContain(SubscriptionPlan.TeamV2)
  })

  it('should handle empty workspace list gracefully', async () => {
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: null })
      .where(
        or(
          eq(workspaces.id, teamWorkspace1.id),
          eq(workspaces.id, teamWorkspace2.id),
        ),
      )

    const mockJob = {} as Job<Record<string, never>>

    // Execute the job - should not throw
    await expect(
      grantUnlimitedSeatsToTeamUsersJob(mockJob),
    ).resolves.not.toThrow()
  })

  it('should only process team workspaces', async () => {
    const mockJob = {} as Job<Record<string, never>>
    await grantUnlimitedSeatsToTeamUsersJob(mockJob)

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
