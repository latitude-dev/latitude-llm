import { addMonths, subMonths } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GrantSource,
  QuotaType,
  SubscriptionPlan,
  SubscriptionPlans,
  Workspace,
} from '../../browser'
import { BadRequestError } from '../../lib/errors'
import * as plans from '../../plans'
import * as factories from '../../tests/factories'
import { validateGrant } from './validate'

const SubscriptionPlansMock = {
  ...SubscriptionPlans,
  [SubscriptionPlan.HobbyV2]: {
    ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    users: 1,
    credits: 10_000,
    latte_credits: 30,
  },
}

describe('validateGrant', () => {
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
  })

  it('fails when non positive grant', async () => {
    await expect(
      validateGrant({
        type: QuotaType.Credits,
        amount: 0,
        source: GrantSource.Subscription,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Can only grant positive amounts'),
    )
  })

  it('fails when invalid unlimited sentinel grant', async () => {
    await expect(
      validateGrant({
        type: QuotaType.Credits,
        amount: 'fake' as any,
        source: GrantSource.Subscription,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Invalid unlimited sentinel value'),
    )
  })

  it('fails when invalid amount grant', async () => {
    await expect(
      validateGrant({
        type: QuotaType.Credits,
        amount: false as any,
        source: GrantSource.Subscription,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Invalid grant amount'))
  })

  it('fails when expired grant periods', async () => {
    await expect(
      validateGrant({
        type: QuotaType.Credits,
        amount: 10,
        source: GrantSource.Subscription,
        workspace: workspace,
        periods: 0,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Grant already expired'))
  })

  it('fails when expired grant date', async () => {
    await expect(
      validateGrant({
        type: QuotaType.Credits,
        amount: 10,
        source: GrantSource.Subscription,
        workspace: workspace,
        expiresAt: subMonths(now, 1),
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Grant already expired'))
  })

  it('fails when duplicated grant', async () => {
    const idempotencyKey = crypto.randomUUID()

    await factories.createGrant({
      type: QuotaType.Credits,
      amount: 10,
      source: GrantSource.Subscription,
      referenceId: 'fake-reference-id',
      workspace: workspace,
      idempotencyKey: idempotencyKey,
    })

    await expect(
      validateGrant({
        type: QuotaType.Credits,
        amount: 10,
        source: GrantSource.Subscription,
        workspace: workspace,
        idempotencyKey: idempotencyKey,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Grant already exists'))
  })

  it('succeeds when limited grant', async () => {
    const result = await validateGrant({
      type: QuotaType.Credits,
      amount: 10,
      source: GrantSource.Subscription,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(true)
  })

  it('succeeds when unlimited grant', async () => {
    const result = await validateGrant({
      type: QuotaType.Credits,
      amount: 'unlimited',
      source: GrantSource.Subscription,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(true)
  })

  it('succeeds when expirable grant', async () => {
    const result = await validateGrant({
      type: QuotaType.Credits,
      amount: 'unlimited',
      source: GrantSource.Subscription,
      workspace: workspace,
      expiresAt: addMonths(now, 1),
    }).then((r) => r.unwrap())

    expect(result).toEqual(true)
  })
})
