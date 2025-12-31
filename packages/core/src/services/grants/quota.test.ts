import { addMonths, startOfDay, subMonths } from 'date-fns'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { database } from '../../client'
import { GrantSource, QuotaType } from '../../constants'
import * as plans from '../../plans'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import { grants } from '../../schema/models/grants'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { computeQuota } from './quota'

const SubscriptionPlansMock = {
  ...SubscriptionPlans,
  [SubscriptionPlan.HobbyV2]: {
    ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    users: 1,
    credits: 10_000,
    latte_credits: 30,
  },
}

const MOCK_DATE = new Date('2025-01-15T12:00:00Z')

describe('computeQuota', () => {
  let now: Date
  let workspace: Workspace

  beforeEach(async () => {
    // Set the system time to a fixed date for consistent testing (avoids date issues with subMonths)
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_DATE)

    vi.spyOn(plans, 'SubscriptionPlans', 'get').mockReturnValue(
      SubscriptionPlansMock as any,
    )

    now = new Date()

    const { workspace: w } = await factories.createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV2,
      createdAt: subMonths(now, 1),
    })
    workspace = w

    await database.delete(grants).where(eq(grants.workspaceId, workspace.id))

    await factories.createGrant({
      type: QuotaType.Seats,
      amount: 1,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Seats,
      amount: 3,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Runs,
      amount: 10_000,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Runs,
      amount: 'unlimited',
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Credits,
      amount: 10,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Credits,
      amount: 100,
      balance: 5,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Credits,
      amount: 20,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
      expiresAt: subMonths(now, 1),
    })
    await factories.createGrant({
      type: QuotaType.Credits,
      amount: 'unlimited',
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
      expiresAt: subMonths(now, 2),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('succeeds when no grants', async () => {
    await database.delete(grants).where(eq(grants.workspaceId, workspace.id))

    const result = await computeQuota({
      type: QuotaType.Credits,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      limit: 0,
      resetsAt: startOfDay(addMonths(now, 1)),
    })
  })

  it('succeeds with granted seats', async () => {
    const result = await computeQuota({
      type: QuotaType.Seats,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      limit: 4,
      resetsAt: startOfDay(addMonths(now, 1)),
    })
  })

  it('succeeds with granted runs', async () => {
    const result = await computeQuota({
      type: QuotaType.Runs,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      limit: 'unlimited',
      resetsAt: startOfDay(addMonths(now, 1)),
    })
  })

  it('succeeds with granted credits', async () => {
    const result = await computeQuota({
      type: QuotaType.Credits,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      limit: 15,
      resetsAt: startOfDay(addMonths(now, 1)),
    })
  })
})
