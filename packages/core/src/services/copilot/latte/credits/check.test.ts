import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SubscriptionPlan,
  SubscriptionPlans,
  Workspace,
} from '../../../../browser'
import { UnprocessableEntityError } from '../../../../lib/errors'
import * as factories from '../../../../tests/factories'
import { checkLatteCredits } from './check'

describe('checkLatteCredits', () => {
  let workspace: Workspace

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const { workspace: w, userData: user } = await factories.createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV2,
    })
    workspace = w

    const { thread } = await factories.createLatteThread({ workspace, user })

    await factories.createLatteRequest({
      credits: Math.floor(
        SubscriptionPlans[SubscriptionPlan.HobbyV2].latte_credits / 2,
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
            SubscriptionPlans[SubscriptionPlan.HobbyV2].latte_credits / 2,
          ) + 1,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Not enough Latte credits'),
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
