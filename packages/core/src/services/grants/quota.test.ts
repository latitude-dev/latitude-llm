import { addMonths, startOfDay, subMonths } from 'date-fns'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GrantSource,
  QuotaType,
  SubscriptionPlan,
  SubscriptionPlans,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import * as plans from '../../plans'
import { grants } from '../../schema'
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

describe('computeQuota', () => {
  let now: Date
  let workspace: Workspace

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

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
