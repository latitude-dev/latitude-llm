import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Project, Workspace } from '../../../../schema/types'
import { SubscriptionPlan, SubscriptionPlans } from '../../../../plans'
import { PaymentRequiredError } from '../../../../lib/errors'
import * as plans from '../../../../plans'
import * as factories from '../../../../tests/factories'
import { checkLatteCredits } from './check'

const SubscriptionPlansMock = {
  ...SubscriptionPlans,
  [SubscriptionPlan.HobbyV2]: {
    ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    latte_credits: 30,
  },
}

describe('checkLatteCredits', () => {
  let workspace: Workspace
  let project: Project

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    vi.spyOn(plans, 'SubscriptionPlans', 'get').mockReturnValue(
      SubscriptionPlansMock as any,
    )

    const { workspace: w, userData: user } = await factories.createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV2,
    })
    const { project: p } = await factories.createProject({ workspace: w })
    workspace = w
    project = p

    const { thread } = await factories.createLatteThread({
      workspace,
      project,
      user,
    })

    await factories.createLatteRequest({
      credits: Math.floor(
        SubscriptionPlansMock[SubscriptionPlan.HobbyV2].latte_credits / 2,
      ),
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      billable: true,
    })
  })

  it('fails when not enough limited credits', async () => {
    await expect(
      checkLatteCredits({
        credits:
          Math.floor(
            SubscriptionPlansMock[SubscriptionPlan.HobbyV2].latte_credits / 2,
          ) + 1,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new PaymentRequiredError(
        'You have reached the maximum number of Latte credits allowed for your Latitude plan. Upgrade now.',
      ),
    )
  })

  it('succeeds when enough limited credits', async () => {
    const result = await checkLatteCredits({ workspace }).then((r) =>
      r.unwrap(),
    )

    expect(result).toEqual(true)
  })

  it('succeeds when enough unlimited credits', async () => {
    const { workspace } = await factories.createWorkspace({
      subscriptionPlan: SubscriptionPlan.EnterpriseV1,
    })

    const result = await checkLatteCredits({
      credits: Infinity,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(true)
  })
})
