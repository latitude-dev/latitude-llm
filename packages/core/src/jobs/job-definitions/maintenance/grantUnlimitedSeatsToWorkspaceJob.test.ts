import { describe, it, expect, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { grantUnlimitedSeatsToWorkspaceJob } from './grantUnlimitedSeatsToWorkspaceJob'
import { SubscriptionPlan } from '../../../plans'
import * as factories from '../../../tests/factories'
import { database } from '../../../client'
import { grants } from '../../../schema/models/grants'
import { workspaces } from '../../../schema/models/workspaces'
import { eq } from 'drizzle-orm'
import { QuotaType } from '../../../constants'

describe('grantUnlimitedSeatsToWorkspaceJob', () => {
  let teamWorkspace1: any
  let teamWorkspace2: any
  let hobbyWorkspace: any
  let workspaceWithoutSubscription: any

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

    const { workspace: w4 } = await factories.createProject({
      workspace: {
        subscriptionPlan: SubscriptionPlan.TeamV1,
      },
    })
    workspaceWithoutSubscription = w4
  })

  it('should grant unlimited seats to TeamV1 workspace', async () => {
    const mockJob = {
      data: { workspaceId: teamWorkspace1.id },
    } as Job<{ workspaceId: number }>

    const result = await grantUnlimitedSeatsToWorkspaceJob(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    const grantsInDb = await database
      .select()
      .from(grants)
      .where(eq(grants.workspaceId, teamWorkspace1.id))

    // Should have the original subscription grant + the new unlimited seats grant
    expect(grantsInDb.length).toBeGreaterThanOrEqual(1)

    // Find the unlimited seats grant
    const unlimitedSeatsGrant = grantsInDb.find(
      (g) =>
        g.type === QuotaType.Seats &&
        g.amount === null && // unlimited grants have null amount
        g.source === 'subscription',
    )
    expect(unlimitedSeatsGrant).toBeDefined()
    expect(unlimitedSeatsGrant?.amount).toBeNull()
  })

  it('should grant unlimited seats to TeamV2 workspace', async () => {
    const mockJob = {
      data: { workspaceId: teamWorkspace2.id },
    } as Job<{ workspaceId: number }>

    const result = await grantUnlimitedSeatsToWorkspaceJob(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    const grantsInDb = await database
      .select()
      .from(grants)
      .where(eq(grants.workspaceId, teamWorkspace2.id))

    const unlimitedSeatsGrant = grantsInDb.find(
      (g) =>
        g.type === QuotaType.Seats &&
        g.amount === null &&
        g.source === 'subscription',
    )
    expect(unlimitedSeatsGrant).toBeDefined()
  })

  it('should skip non-team workspaces', async () => {
    const mockJob = {
      data: { workspaceId: hobbyWorkspace.id },
    } as Job<{ workspaceId: number }>

    const result = await grantUnlimitedSeatsToWorkspaceJob(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()

    const grantsInDb = await database
      .select()
      .from(grants)
      .where(eq(grants.workspaceId, hobbyWorkspace.id))

    const unlimitedSeatsGrant = grantsInDb.find(
      (g) =>
        g.type === QuotaType.Seats &&
        g.amount === null &&
        g.source === 'subscription',
    )
    expect(unlimitedSeatsGrant).toBeUndefined()
  })

  it('should handle missing workspace', async () => {
    const mockJob = {
      data: { workspaceId: 99999 },
    } as Job<{ workspaceId: number }>

    const result = await grantUnlimitedSeatsToWorkspaceJob(mockJob)

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

    const result = await grantUnlimitedSeatsToWorkspaceJob(mockJob)

    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('should use idempotency to prevent duplicate grants', async () => {
    const mockJob = {
      data: { workspaceId: teamWorkspace1.id },
    } as Job<{ workspaceId: number }>

    const result1 = await grantUnlimitedSeatsToWorkspaceJob(mockJob)
    const result2 = await grantUnlimitedSeatsToWorkspaceJob(mockJob)

    expect(result1.error).toBeUndefined()
    expect(result1.value).toBeDefined()

    expect(result2.error).toBeDefined()
    expect(result2.error?.message).toContain('Grant already exists')

    const grantsInDb = await database
      .select()
      .from(grants)
      .where(eq(grants.workspaceId, teamWorkspace1.id))

    // Find all seats grants
    const seatsGrants = grantsInDb.filter(
      (g) => g.type === QuotaType.Seats && g.source === 'subscription',
    )

    // We should have exactly 2 seats grants: 1 original (amount: 5) + 1 unlimited (amount: null)
    expect(seatsGrants.length).toBe(2)

    // Find the unlimited seats grant (amount: null)
    const unlimitedSeatsGrant = seatsGrants.find((g) => g.amount === null)
    expect(unlimitedSeatsGrant).toBeDefined()

    // Find the original subscription grant (amount: 5)
    const originalSeatsGrant = seatsGrants.find((g) => g.amount === 5)
    expect(originalSeatsGrant).toBeDefined()

    // Should only have one unlimited seats grant despite running twice
    expect(unlimitedSeatsGrant).toBeDefined()
  })
})
