import { addDays, isSameDay } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuotaType } from '../../constants'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import * as plans from '../../plans'
import { createUser } from '../../tests/factories'
import { computeQuota } from '../grants/quota'
import { createWorkspace } from './create'
import * as envModule from '@latitude-data/env'

const SubscriptionPlansMock = {
  ...SubscriptionPlans,
  [SubscriptionPlan.HobbyV2]: {
    ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    users: 5,
    credits: 10_000,
    latte_credits: 30,
  },
}

describe('createWorkspace', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    vi.spyOn(plans, 'SubscriptionPlans', 'get').mockReturnValue(
      SubscriptionPlansMock as any,
    )

    vi.spyOn(envModule, 'env', 'get').mockReturnValue({
      ...envModule.env,
      LATITUDE_ENTERPRISE_MODE: false,
    } as typeof envModule.env)
  })

  it('creates a hobby plan subscription', async () => {
    const user = await createUser()
    const workspace = await createWorkspace({ name: 'foo', user }).then((r) =>
      r.unwrap(),
    )
    expect(workspace.currentSubscription).toEqual(
      expect.objectContaining({ plan: 'hobby_v3' }),
    )
    expect(
      await computeQuota({
        type: QuotaType.Seats,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(2)
    expect(
      await computeQuota({
        type: QuotaType.Runs,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(10_000)
    expect(
      await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap().limit),
    ).toEqual(30)
  })

  it('creates a subscription with trial end date 30 days from now', async () => {
    const now = new Date()
    const user = await createUser()
    const workspace = await createWorkspace({ name: 'foo', user }).then((r) =>
      r.unwrap(),
    )

    const trialEndsAt = workspace.currentSubscription.trialEndsAt!
    expect(isSameDay(trialEndsAt, addDays(now, 30))).toBe(true)
  })

  describe('enterprise mode', () => {
    it('creates an enterprise plan subscription when LATITUDE_ENTERPRISE_MODE is true', async () => {
      vi.spyOn(envModule, 'env', 'get').mockReturnValue({
        ...envModule.env,
        LATITUDE_ENTERPRISE_MODE: true,
      } as typeof envModule.env)

      const user = await createUser()
      const workspace = await createWorkspace({ name: 'foo', user }).then((r) =>
        r.unwrap(),
      )

      expect(workspace.currentSubscription).toEqual(
        expect.objectContaining({ plan: SubscriptionPlan.EnterpriseV1 }),
      )
    })

    it('creates a hobby plan subscription when LATITUDE_ENTERPRISE_MODE is false', async () => {
      vi.spyOn(envModule, 'env', 'get').mockReturnValue({
        ...envModule.env,
        LATITUDE_ENTERPRISE_MODE: false,
      } as typeof envModule.env)

      const user = await createUser()
      const workspace = await createWorkspace({ name: 'foo', user }).then((r) =>
        r.unwrap(),
      )

      expect(workspace.currentSubscription).toEqual(
        expect.objectContaining({ plan: SubscriptionPlan.HobbyV3 }),
      )
    })

    it('allows overriding the plan even in enterprise mode', async () => {
      vi.spyOn(envModule, 'env', 'get').mockReturnValue({
        ...envModule.env,
        LATITUDE_ENTERPRISE_MODE: true,
      } as typeof envModule.env)

      const user = await createUser()
      const workspace = await createWorkspace({
        name: 'foo',
        user,
        subscriptionPlan: SubscriptionPlan.TeamV4,
      }).then((r) => r.unwrap())

      expect(workspace.currentSubscription).toEqual(
        expect.objectContaining({ plan: SubscriptionPlan.TeamV4 }),
      )
    })
  })
})
