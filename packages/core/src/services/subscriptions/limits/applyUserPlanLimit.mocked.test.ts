import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuotaType } from '../../../constants'
import { SubscriptionPlan } from '../../../plans'
import { type Subscription } from '../../../schema/models/types/Subscription'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { createSubscription, createWorkspace } from '../../../tests/factories'
import { computeQuota } from '../../grants/quota'
import { applyUserPlanLimit } from './applyUserPlanLimit'

// Mock computeQuota for edge case testing
vi.mock('../../grants/quota')

const mockComputeQuota = vi.mocked(computeQuota)

describe('applyUserPlanLimit - mocked edge cases', () => {
  let workspace: Workspace & { currentSubscription: Subscription }

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()

    // Create a test workspace with HobbyV2 plan (1 user limit)
    const result = await createWorkspace({
      subscriptionPlan: SubscriptionPlan.HobbyV2,
    })
    const subscription = await createSubscription({
      workspaceId: result.workspace.id,
      plan: SubscriptionPlan.HobbyV2,
    })

    workspace = {
      ...result.workspace,
      currentSubscription: subscription,
    }
  })

  it('returns nil when quota computation returns null', async () => {
    // Arrange
    mockComputeQuota.mockResolvedValueOnce({
      ok: true,
      value: null,
      error: undefined,
    } as any)

    // Act
    const result = await applyUserPlanLimit({ workspace })

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toBeUndefined()
    expect(mockComputeQuota).toHaveBeenCalledWith({
      type: QuotaType.Seats,
      workspace,
    })
  })

  it('returns nil when quota limit is unlimited', async () => {
    // Arrange
    mockComputeQuota.mockResolvedValueOnce({
      ok: true,
      value: { limit: 'unlimited', resetsAt: new Date() },
      error: undefined,
    } as any)

    // Act
    const result = await applyUserPlanLimit({ workspace })

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toBeUndefined()
    expect(mockComputeQuota).toHaveBeenCalledWith({
      type: QuotaType.Seats,
      workspace,
    })
  })

  it('handles quota computation failure gracefully', async () => {
    // Arrange - mock computeQuota to return an error
    const quotaError = new Error('Quota computation failed')
    mockComputeQuota.mockResolvedValueOnce({
      ok: false,
      value: undefined,
      error: quotaError,
    } as any)

    // Act
    const result = await applyUserPlanLimit({ workspace })

    // Assert - when computeQuota fails, .then((r) => r.value) returns undefined,
    // and the function returns Result.nil() due to the (!quota) check
    expect(result.ok).toBe(true)
    expect(result.value).toBeUndefined()
    expect(mockComputeQuota).toHaveBeenCalledWith({
      type: QuotaType.Seats,
      workspace,
    })
  })
})
