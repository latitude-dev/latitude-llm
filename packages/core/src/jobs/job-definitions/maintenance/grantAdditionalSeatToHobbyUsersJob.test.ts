import { describe, it, expect, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { grantAdditionalSeatToHobbyUsersJob } from './grantAdditionalSeatToHobbyUsersJob'
import { SubscriptionPlan } from '../../../plans'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { workspaces } from '../../../schema/models/workspaces'
import { subscriptions } from '../../../schema/models/subscriptions'
import { eq, or } from 'drizzle-orm'

describe('grantAdditionalSeatToHobbyUsersJob', () => {
  let hobbyWorkspace1: any
  let hobbyWorkspace2: any
  let teamWorkspace: any

  beforeEach(async () => {
    // Create HobbyV1 workspace
    const { workspace: w1 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      },
    })
    hobbyWorkspace1 = w1

    // Create HobbyV2 workspace
    const { workspace: w2 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV2,
      },
    })
    hobbyWorkspace2 = w2

    // Create TeamV1 workspace (should not be processed)
    const { workspace: w3 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV1,
      },
    })
    teamWorkspace = w3
  })

  it('should schedule individual jobs for hobby workspaces', async () => {
    const mockJob = {} as Job<Record<string, never>>

    // Execute the job
    await grantAdditionalSeatToHobbyUsersJob(mockJob)

    // Verify that the workspaces exist and have the correct plans
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
    // Delete all hobby workspaces to test empty case
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
    await expect(
      grantAdditionalSeatToHobbyUsersJob(mockJob),
    ).resolves.not.toThrow()
  })

  it('should only process hobby workspaces', async () => {
    const mockJob = {} as Job<Record<string, never>>

    // Execute the job
    await grantAdditionalSeatToHobbyUsersJob(mockJob)

    // Verify team workspace still has TeamV1 plan
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
