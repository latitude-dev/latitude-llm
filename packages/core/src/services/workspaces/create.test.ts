import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuotaType } from '../../constants'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import * as plans from '../../plans'
import { createUser } from '../../tests/factories'
import { computeQuota } from '../grants/quota'
import { createWorkspace } from './create'

const SubscriptionPlansMock = {
  ...SubscriptionPlans,
  [SubscriptionPlan.HobbyV2]: {
    ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    users: 5,
    credits: 10_000,
    latte_credits: 30,
  },
}

vi.mock('./path/to/subscription/service', () => ({
  createSubscription: vi.fn(),
}))

describe('createWorkspace', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    vi.spyOn(plans, 'SubscriptionPlans', 'get').mockReturnValue(
      SubscriptionPlansMock as any,
    )
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
})
