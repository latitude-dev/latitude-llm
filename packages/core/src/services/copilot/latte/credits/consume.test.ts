import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  LatteThread,
  SubscriptionPlan,
  SubscriptionPlans,
  User,
  Workspace,
  Project,
} from '../../../../browser'
import * as cache from '../../../../cache'
import * as plans from '../../../../plans'
import * as factories from '../../../../tests/factories'
import { WebsocketClient } from '../../../../websockets/workers'
import { consumeLatteCredits } from './consume'

const SubscriptionPlansMock = {
  ...SubscriptionPlans,
  [SubscriptionPlan.HobbyV2]: {
    ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    latte_credits: 30,
  },
}

describe('consumeLatteCredits', () => {
  let mocks: {
    cache: {
      del: MockInstance
    }
    websocket: MockInstance
  }

  let workspace: Workspace
  let project: Project
  let user: User
  let thread: LatteThread

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    vi.spyOn(plans, 'SubscriptionPlans', 'get').mockReturnValue(
      SubscriptionPlansMock as any,
    )

    const { workspace: w, userData: u } = await factories.createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV2,
    })
    const { project: p } = await factories.createProject({ workspace: w })
    workspace = w
    project = p
    user = u

    const { thread: t } = await factories.createLatteThread({
      workspace,
      project,
      user,
    })
    thread = t

    const delCacheMock = vi.fn().mockResolvedValue(null)
    vi.spyOn(cache, 'cache').mockImplementation(async () => {
      return {
        del: delCacheMock,
      } as unknown as cache.Cache
    })

    mocks = {
      cache: {
        del: delCacheMock,
      },
      websocket: vi
        .spyOn(WebsocketClient, 'sendEvent')
        .mockImplementation(async () => {}),
    }
  })

  it('succeeds when consuming billable credits', async () => {
    const idempotencyKey = crypto.randomUUID()

    const result = await consumeLatteCredits({
      usage: {
        promptTokens: 100,
        completionTokens: 100,
        totalTokens: 200,
      },
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      idempotencyKey: idempotencyKey,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      id: expect.any(Number),
      uuid: idempotencyKey,
      threadUuid: thread.uuid,
      workspaceId: workspace.id,
      userId: user.id,
      credits: 1,
      billable: true,
      error: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    expect(mocks.cache.del).toHaveBeenCalledOnce()
    expect(mocks.websocket).toHaveBeenLastCalledWith('latteThreadUpdate', {
      workspaceId: workspace.id,
      data: {
        type: 'usage',
        threadUuid: thread.uuid,
        usage: {
          included: 30,
          billable: 1,
          unbillable: 0,
          resetsAt: expect.any(Date),
        },
      },
    })
  })

  it('succeeds when consuming unbillable credits', async () => {
    const idempotencyKey = crypto.randomUUID()

    const result = await consumeLatteCredits({
      usage: {
        promptTokens: 100,
        completionTokens: 100,
        totalTokens: 200,
      },
      threadUuid: thread.uuid,
      user: user,
      workspace: workspace,
      error: new Error('Some error happened!'),
      idempotencyKey: idempotencyKey,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      id: expect.any(Number),
      uuid: idempotencyKey,
      threadUuid: thread.uuid,
      workspaceId: workspace.id,
      userId: user.id,
      credits: 1,
      billable: false,
      error: 'Some error happened!',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    expect(mocks.cache.del).toHaveBeenCalledOnce()
    expect(mocks.websocket).toHaveBeenLastCalledWith('latteThreadUpdate', {
      workspaceId: workspace.id,
      data: {
        type: 'usage',
        threadUuid: thread.uuid,
        usage: {
          included: 30,
          billable: 0,
          unbillable: 1,
          resetsAt: expect.any(Date),
        },
      },
    })
  })
})
