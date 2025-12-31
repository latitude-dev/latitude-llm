import { addMonths, startOfDay, subMonths } from 'date-fns'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { type LatteThread } from '../../../../schema/models/types/LatteThread'
import { type Project } from '../../../../schema/models/types/Project'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { SubscriptionPlan, SubscriptionPlans } from '../../../../plans'
import * as cache from '../../../../cache'
import * as plans from '../../../../plans'
import * as factories from '../../../../tests/factories'
import { usageLatteCredits } from './usage'

const SubscriptionPlansMock = {
  ...SubscriptionPlans,
  [SubscriptionPlan.HobbyV2]: {
    ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    latte_credits: 30,
  },
}

describe('usageLatteCredits', () => {
  let mocks: {
    cache: {
      get: MockInstance
      set: MockInstance
    }
  }

  let now: Date
  let workspace: Workspace
  let project: Project
  let thread: LatteThread

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    vi.spyOn(plans, 'SubscriptionPlans', 'get').mockReturnValue(
      SubscriptionPlansMock as any,
    )

    now = new Date()

    const { workspace: w, userData: user } = await factories.createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV2,
      createdAt: subMonths(now, 1),
    })
    const { project: p } = await factories.createProject({ workspace: w })
    workspace = w
    project = p

    const { thread: t } = await factories.createLatteThread({
      workspace,
      project,
      user,
    })
    thread = t

    await factories.createLatteRequest({
      credits: 1,
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      billable: true,
      createdAt: subMonths(now, 1),
    })
    await factories.createLatteRequest({
      credits: 3,
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      billable: false,
      createdAt: subMonths(now, 1),
    })
    await factories.createLatteRequest({
      credits: 3,
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      billable: true,
      createdAt: subMonths(now, 1),
    })
    await factories.createLatteRequest({
      credits: 1,
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      billable: true,
      createdAt: now,
    })
    await factories.createLatteRequest({
      credits: 3,
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      billable: false,
      createdAt: now,
    })
    await factories.createLatteRequest({
      credits: 3,
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      billable: true,
      createdAt: now,
    })

    const getCacheMock = vi.fn().mockResolvedValue(null)
    const setCacheMock = vi.fn().mockResolvedValue(true)
    vi.spyOn(cache, 'cache').mockImplementation(async () => {
      return {
        get: getCacheMock,
        set: setCacheMock,
        del: vi.fn().mockResolvedValue(true),
      } as unknown as cache.Cache
    })

    mocks = {
      cache: {
        get: getCacheMock,
        set: setCacheMock,
      },
    }
  })

  it('succeeds when no requests', async () => {
    const { workspace } = await factories.createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV2,
      createdAt: subMonths(now, 1),
    })

    const result = await usageLatteCredits({ workspace }).then((r) =>
      r.unwrap(),
    )

    expect(result).toEqual({
      limit: 30,
      billable: 0,
      unbillable: 0,
      resetsAt: startOfDay(addMonths(now, 1)),
    })
    expect(mocks.cache.get).toHaveBeenCalledOnce()
    expect(mocks.cache.set).toHaveBeenCalledOnce()
  })

  it('succeeds when not cached', async () => {
    const result = await usageLatteCredits({ workspace }).then((r) =>
      r.unwrap(),
    )

    expect(result).toEqual({
      limit: 30,
      billable: 4,
      unbillable: 3,
      resetsAt: startOfDay(addMonths(now, 1)),
    })
    expect(mocks.cache.get).toHaveBeenCalledOnce()
    expect(mocks.cache.set).toHaveBeenCalledOnce()
  })

  it('succeeds when cached', async () => {
    mocks.cache.get.mockResolvedValue(
      JSON.stringify({
        limit: 0,
        billable: 0,
        unbillable: 0,
        resetsAt: startOfDay(addMonths(now, 1)),
      }),
    )

    const result = await usageLatteCredits({ workspace }).then((r) =>
      r.unwrap(),
    )

    expect(result).toEqual({
      limit: 0,
      billable: 0,
      unbillable: 0,
      resetsAt: startOfDay(addMonths(now, 1)),
    })
    expect(mocks.cache.get).toHaveBeenCalledOnce()
    expect(mocks.cache.set).not.toHaveBeenCalled()
  })

  it('succeeds when cached but fresh', async () => {
    mocks.cache.get.mockResolvedValue(
      JSON.stringify({
        limit: 0,
        billable: 0,
        unbillable: 0,
        resetsAt: startOfDay(addMonths(now, 1)),
      }),
    )

    const result = await usageLatteCredits({ workspace, fresh: true }).then(
      (r) => r.unwrap(),
    )

    expect(result).toEqual({
      limit: 30,
      billable: 4,
      unbillable: 3,
      resetsAt: startOfDay(addMonths(now, 1)),
    })
    expect(mocks.cache.get).not.toHaveBeenCalled()
    expect(mocks.cache.set).toHaveBeenCalledOnce()
  })

  it('succeeds when paid subscription', async () => {
    const { workspace } = await factories.createWorkspace({
      subscriptionPlan: SubscriptionPlan.EnterpriseV1,
      createdAt: subMonths(now, 1),
    })

    const result = await usageLatteCredits({ workspace }).then((r) =>
      r.unwrap(),
    )

    expect(result).toEqual({
      limit: 'unlimited',
      billable: 0,
      unbillable: 0,
      resetsAt: startOfDay(addMonths(now, 1)),
    })
    expect(mocks.cache.get).toHaveBeenCalledOnce()
    expect(mocks.cache.set).toHaveBeenCalledOnce()
  })
})
