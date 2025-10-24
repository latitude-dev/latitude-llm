import { describe, it, expect, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { grantAdditionalSeatToWorkspaceJob } from './grantAdditionalSeatToWorkspaceJob'
import { SubscriptionPlan } from '../../../plans'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { grants } from '../../../schema/models/grants'
import { workspaces } from '../../../schema/models/workspaces'
import { eq } from 'drizzle-orm'
import { QuotaType } from '../../../constants'

describe('grantAdditionalSeatToWorkspaceJob', () => {
  let hobbyWorkspace: any
  let teamWorkspace: any
  let workspaceWithoutSubscription: any

  beforeEach(async () => {
    // Create HobbyV1 workspace
    const { workspace: w1 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      },
    })
    hobbyWorkspace = w1

    // Create TeamV1 workspace (should be skipped)
    const { workspace: w2 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV1,
      },
    })
    teamWorkspace = w2

    // Create workspace without subscription
    const { workspace: w3 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.HobbyV2,
      },
    })
    workspaceWithoutSubscription = w3
  })

  it('should grant additional seat to hobby workspace', async () => {
    const mockJob = {
      data: { workspaceId: hobbyWorkspace.id },
    } as Job<{ workspaceId: number }>

    // Execute the job
    const result = await grantAdditionalSeatToWorkspaceJob(mockJob)

    // Verify result
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    // Verify grant was created in database
    const grantsInDb = await database
      .select()
      .from(grants)
      .where(eq(grants.workspaceId, hobbyWorkspace.id))

    // Should have the original subscription grant + the new additional seat grant
    expect(grantsInDb.length).toBeGreaterThanOrEqual(1)

    // Find the additional seat grant
    const additionalSeatGrant = grantsInDb.find(
      (g) =>
        g.type === QuotaType.Seats &&
        g.amount === 1 &&
        g.source === 'subscription',
    )
    expect(additionalSeatGrant).toBeDefined()
    expect(additionalSeatGrant?.amount).toBe(1)
  })

  it('should skip non-hobby workspaces', async () => {
    const mockJob = {
      data: { workspaceId: teamWorkspace.id },
    } as Job<{ workspaceId: number }>

    // Execute the job
    const result = await grantAdditionalSeatToWorkspaceJob(mockJob)

    // Verify result
    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()

    // Verify no additional grant was created
    const grantsInDb = await database
      .select()
      .from(grants)
      .where(eq(grants.workspaceId, teamWorkspace.id))

    // Should only have the original subscription grants, no additional seat grant
    const additionalSeatGrant = grantsInDb.find(
      (g) =>
        g.type === QuotaType.Seats &&
        g.amount === 1 &&
        g.source === 'subscription',
    )
    expect(additionalSeatGrant).toBeUndefined()
  })

  it('should handle missing workspace', async () => {
    const mockJob = {
      data: { workspaceId: 99999 }, // Non-existent workspace
    } as Job<{ workspaceId: number }>

    // Execute the job
    const result = await grantAdditionalSeatToWorkspaceJob(mockJob)

    // Verify result
    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('should handle workspace without subscription', async () => {
    // Remove subscription from workspace
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: null })
      .where(eq(workspaces.id, workspaceWithoutSubscription.id))

    const mockJob = {
      data: { workspaceId: workspaceWithoutSubscription.id },
    } as Job<{ workspaceId: number }>

    // Execute the job
    const result = await grantAdditionalSeatToWorkspaceJob(mockJob)

    // Verify result
    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('should use idempotency to prevent duplicate grants', async () => {
    const mockJob = {
      data: { workspaceId: hobbyWorkspace.id },
    } as Job<{ workspaceId: number }>

    // Execute the job twice
    const result1 = await grantAdditionalSeatToWorkspaceJob(mockJob)
    const result2 = await grantAdditionalSeatToWorkspaceJob(mockJob)

    // First execution should succeed
    expect(result1.error).toBeUndefined()
    expect(result1.value).toBeDefined()

    // Second execution should fail due to idempotency
    expect(result2.error).toBeDefined()
    expect(result2.error?.message).toContain('Grant already exists')

    // Verify only one additional grant was created (due to idempotency)
    const grantsInDb = await database
      .select()
      .from(grants)
      .where(eq(grants.workspaceId, hobbyWorkspace.id))

    // Find grants that are additional seat grants (not the original subscription grant)
    // The original subscription grant should be the first one created, our additional grant should be the last one
    const seatGrants = grantsInDb.filter(
      (g) =>
        g.type === QuotaType.Seats &&
        g.amount === 1 &&
        g.source === 'subscription',
    )

    // We should have exactly 2 seat grants: 1 original + 1 additional
    expect(seatGrants.length).toBe(2)

    // The additional grant should be the one with the higher ID (created later)
    const additionalSeatGrant = seatGrants.find(
      (g) => g.id === Math.max(...seatGrants.map((sg) => sg.id)),
    )

    // Should only have one additional seat grant despite running twice
    expect(additionalSeatGrant).toBeDefined()
  })
})
