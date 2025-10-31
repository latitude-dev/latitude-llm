import { addMonths, startOfDay, subMonths } from 'date-fns'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import * as cache from '../../cache'
import { database } from '../../client'
import { GrantSource, QuotaType } from '../../constants'
import { BadRequestError } from '../../lib/errors'
import * as plans from '../../plans'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import { grants } from '../../schema/models/grants'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { issueGrant } from './issue'
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

describe('issueGrant', () => {
  let now: Date
  let workspace: Workspace
  let cacheMock: {
    del: MockInstance
  }

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

    const delCacheMock = vi.fn().mockResolvedValue(null)
    vi.spyOn(cache, 'cache').mockImplementation(async () => {
      return {
        del: delCacheMock,
      } as unknown as cache.Cache
    })

    cacheMock = {
      del: delCacheMock,
    }

    await database.delete(grants).where(eq(grants.workspaceId, workspace.id))
  })

  it('fails when invalid grant', async () => {
    await expect(
      issueGrant({
        type: QuotaType.Credits,
        amount: 0,
        source: GrantSource.Subscription,
        referenceId: 'fake-reference-id',
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Can only grant positive amounts'),
    )

    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(0)
    expect(cacheMock.del).not.toHaveBeenCalled()
  })

  it('succeeds when limited grant', async () => {
    const result = await issueGrant({
      type: QuotaType.Credits,
      amount: 10,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        uuid: expect.any(String),
        workspaceId: workspace.id,
        referenceId: 'fake-reference-id',
        source: GrantSource.Subscription,
        type: QuotaType.Credits,
        amount: 10,
        balance: 10,
        expiresAt: null,
      }),
    )
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(10)
    expect(cacheMock.del).toHaveBeenCalledOnce()
  })

  it('succeeds when unlimited grant', async () => {
    const idempotencyKey = crypto.randomUUID()

    const result = await issueGrant({
      type: QuotaType.Credits,
      amount: 'unlimited',
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
      idempotencyKey: idempotencyKey,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        uuid: idempotencyKey,
        workspaceId: workspace.id,
        referenceId: 'fake-reference-id',
        source: GrantSource.Subscription,
        type: QuotaType.Credits,
        amount: 'unlimited',
        balance: 0,
        expiresAt: null,
      }),
    )
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual('unlimited')
    expect(cacheMock.del).toHaveBeenCalledOnce()
  })

  it('succeeds when expirable grant on periods', async () => {
    // Calculate billableFrom to match getLatestRenewalDate behavior
    // This handles edge cases like Oct 31 -> workspace created Sep 30
    const workspaceCreatedAt = subMonths(now, 1)
    const billableFrom = new Date(workspaceCreatedAt)
    billableFrom.setFullYear(now.getFullYear())
    billableFrom.setMonth(now.getMonth())

    const result = await issueGrant({
      type: QuotaType.Credits,
      amount: 10,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
      periods: 3,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        uuid: expect.any(String),
        workspaceId: workspace.id,
        referenceId: 'fake-reference-id',
        source: GrantSource.Subscription,
        type: QuotaType.Credits,
        amount: 10,
        balance: 10,
        expiresAt: startOfDay(addMonths(billableFrom, 3)),
      }),
    )
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(10)
    expect(cacheMock.del).toHaveBeenCalledOnce()
  })

  it('succeeds when expirable grant on time', async () => {
    const result = await issueGrant({
      type: QuotaType.Runs,
      amount: 10,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
      expiresAt: addMonths(now, 1),
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        uuid: expect.any(String),
        workspaceId: workspace.id,
        referenceId: 'fake-reference-id',
        source: GrantSource.Subscription,
        type: QuotaType.Runs,
        amount: 10,
        balance: 10,
        expiresAt: addMonths(now, 1),
      }),
    )
    expect(
      await computeQuota({
        type: QuotaType.Runs,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(10)
    expect(cacheMock.del).not.toHaveBeenCalled()
  })
})
