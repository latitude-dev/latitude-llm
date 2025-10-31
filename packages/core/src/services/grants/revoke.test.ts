import { endOfDay, subDays, subMonths } from 'date-fns'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { database } from '../../client'
import { GrantSource, QuotaType } from '../../constants'
import * as plans from '../../plans'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import { grants } from '../../schema/models/grants'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { computeQuota } from './quota'
import { revokeGrant, revokeGrants } from './revoke'

const SubscriptionPlansMock = {
  ...SubscriptionPlans,
  [SubscriptionPlan.HobbyV2]: {
    ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    users: 1,
    credits: 10_000,
    latte_credits: 30,
  },
}

describe('revokeGrant', () => {
  let now: Date
  let workspace: Workspace
  let billableFrom: Date

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

    // Calculate billableFrom to match getLatestRenewalDate behavior
    // This handles edge cases like Oct 31 -> workspace created Sep 30
    const workspaceCreatedAt = subMonths(now, 1)
    billableFrom = new Date(workspaceCreatedAt)
    billableFrom.setFullYear(now.getFullYear())
    billableFrom.setMonth(now.getMonth())

    await database.delete(grants).where(eq(grants.workspaceId, workspace.id))

    await factories.createGrant({
      type: QuotaType.Seats,
      amount: 5,
      source: GrantSource.Reward,
      referenceId: 'fake-reference-id-1',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Runs,
      amount: 'unlimited',
      source: GrantSource.Promocode,
      referenceId: 'fake-reference-id-2',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Credits,
      amount: 10,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id-3',
      workspace: workspace,
    })
    await factories.createGrant({
      type: QuotaType.Credits,
      amount: 20,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id-4',
      workspace: workspace,
    })
  })

  it('succeeds when specific grant', async () => {
    const grant = await factories.createGrant({
      type: QuotaType.Credits,
      amount: 10,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
    })

    const result = await revokeGrant({
      grant: grant,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        referenceId: 'fake-reference-id',
        source: GrantSource.Subscription,
        type: QuotaType.Credits,
        amount: 10,
        balance: 0,
        expiresAt: endOfDay(subDays(billableFrom, 1)),
      }),
    )
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(30)
  })

  it('succeeds when no grants', async () => {
    await database.delete(grants).where(eq(grants.workspaceId, workspace.id))

    const result = await revokeGrants({
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual([])
    expect(
      await computeQuota({
        type: QuotaType.Seats,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
    expect(
      await computeQuota({
        type: QuotaType.Runs,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
  })

  it('succeeds when type grants', async () => {
    const result = await revokeGrants({
      type: QuotaType.Credits,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-3',
          source: GrantSource.Subscription,
          type: QuotaType.Credits,
          amount: 10,
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-4',
          source: GrantSource.Subscription,
          type: QuotaType.Credits,
          amount: 20,
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
      ]),
    )
    expect(
      await computeQuota({
        type: QuotaType.Seats,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(5)
    expect(
      await computeQuota({
        type: QuotaType.Runs,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual('unlimited')
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
  })

  it('succeeds when source grants', async () => {
    const result = await revokeGrants({
      source: GrantSource.Subscription,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-3',
          source: GrantSource.Subscription,
          type: QuotaType.Credits,
          amount: 10,
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-4',
          source: GrantSource.Subscription,
          type: QuotaType.Credits,
          amount: 20,
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
      ]),
    )
    expect(
      await computeQuota({
        type: QuotaType.Seats,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(5)
    expect(
      await computeQuota({
        type: QuotaType.Runs,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual('unlimited')
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
  })

  it('succeeds when reference grants', async () => {
    const result = await revokeGrants({
      referenceId: 'fake-reference-id-3',
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-3',
          source: GrantSource.Subscription,
          type: QuotaType.Credits,
          amount: 10,
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
      ]),
    )
    expect(
      await computeQuota({
        type: QuotaType.Seats,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(5)
    expect(
      await computeQuota({
        type: QuotaType.Runs,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual('unlimited')
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(20)
  })

  it('succeeds when all grants', async () => {
    const result = await revokeGrants({
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-1',
          source: GrantSource.Reward,
          type: QuotaType.Seats,
          amount: 5,
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-2',
          source: GrantSource.Promocode,
          type: QuotaType.Runs,
          amount: 'unlimited',
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-3',
          source: GrantSource.Subscription,
          type: QuotaType.Credits,
          amount: 10,
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
        expect.objectContaining({
          workspaceId: workspace.id,
          referenceId: 'fake-reference-id-4',
          source: GrantSource.Subscription,
          type: QuotaType.Credits,
          amount: 20,
          balance: 0,
          expiresAt: endOfDay(subDays(billableFrom, 1)),
        }),
      ]),
    )
    expect(
      await computeQuota({
        type: QuotaType.Seats,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
    expect(
      await computeQuota({
        type: QuotaType.Runs,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
  })
})
