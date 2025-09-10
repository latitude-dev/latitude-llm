import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { PaymentRequiredError } from '@latitude-data/constants/errors'
import { Providers } from '@latitude-data/constants'
import { createChain } from 'promptl-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Workspace } from '../../../browser'
import { Result } from '../../../lib/Result'
import { validateChain } from './index'
import * as applyCreditPlanLimitModule from '../../../services/subscriptions/limits/applyCreditPlanLimit'
import * as checkFreeProviderQuotaModule from '../checkFreeProviderQuota'

describe('validateChain - Plan Limits', () => {
  let workspace: Workspace
  let providersMap: Map<string, any>
  let mockApplyCreditPlanLimit: any
  let mockCheckFreeProviderQuota: any

  beforeEach(() => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    // Mock workspace
    workspace = {
      id: 1,
      uuid: 'test-uuid',
      name: 'Test Workspace',
      createdAt: new Date(),
      updatedAt: new Date(),
      creatorId: '1',
      currentSubscriptionId: 1,
      defaultProviderId: null,
    } as Workspace

    // Mock providers map
    providersMap = new Map([
      [
        'openai',
        {
          id: 1,
          name: 'openai',
          provider: Providers.OpenAI,
          token: 'test-token',
          createdAt: new Date(),
          updatedAt: new Date(),
          workspaceId: workspace.id,
        },
      ],
    ])

    // Mock applyCreditPlanLimit
    mockApplyCreditPlanLimit = vi.fn()
    vi.spyOn(
      applyCreditPlanLimitModule,
      'applyCreditPlanLimit',
    ).mockImplementation(mockApplyCreditPlanLimit)

    // Mock checkFreeProviderQuota to avoid database calls
    mockCheckFreeProviderQuota = vi.fn().mockResolvedValue(Result.nil())
    vi.spyOn(
      checkFreeProviderQuotaModule,
      'checkFreeProviderQuota',
    ).mockImplementation(mockCheckFreeProviderQuota)
  })

  it('succeeds when plan limit check passes', async () => {
    // Mock applyCreditPlanLimit to return success (no limit exceeded)
    mockApplyCreditPlanLimit.mockResolvedValue(Result.nil())

    const chain = createChain({
      prompt: `
        ---
        provider: openai
        model: gpt-4o-mini
        ---

        Test prompt
      `,
      parameters: {},
    })

    const result = await validateChain({
      workspace,
      providersMap,
      chain,
      newMessages: undefined,
    })

    expect(result.ok).toBe(true)
    expect(mockApplyCreditPlanLimit).toHaveBeenCalledWith({ workspace })
    expect(mockCheckFreeProviderQuota).toHaveBeenCalled()
  })

  it('fails when plan limit is exceeded', async () => {
    // Mock applyCreditPlanLimit to return PaymentRequiredError
    const paymentError = new PaymentRequiredError('Plan limit exceeded')
    mockApplyCreditPlanLimit.mockResolvedValue(Result.error(paymentError))

    const chain = createChain({
      prompt: `
        ---
        provider: openai
        model: gpt-4o-mini
        ---

        Test prompt
      `,
      parameters: {},
    })

    const result = await validateChain({
      workspace,
      providersMap,
      chain,
      newMessages: undefined,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(ChainError)
    if (result.error) {
      expect(result.error.code).toBe(RunErrorCodes.PaymentRequiredError)
      expect(result.error.message).toContain('Plan limit exceeded')
    }
    expect(mockApplyCreditPlanLimit).toHaveBeenCalledWith({ workspace })
    expect(mockCheckFreeProviderQuota).not.toHaveBeenCalled() // Should fail before this check
  })

  it('handles other errors from plan limit check', async () => {
    // Mock applyCreditPlanLimit to throw an unexpected error
    mockApplyCreditPlanLimit.mockRejectedValue(
      new Error('Database connection failed'),
    )

    const chain = createChain({
      prompt: `
        ---
        provider: openai
        model: gpt-4o-mini
        ---

        Test prompt
      `,
      parameters: {},
    })

    const result = await validateChain({
      workspace,
      providersMap,
      chain,
      newMessages: undefined,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(ChainError)
    if (result.error) {
      expect(result.error.code).toBe(RunErrorCodes.Unknown)
      expect(result.error.message).toContain('Database connection failed')
    }
    expect(mockApplyCreditPlanLimit).toHaveBeenCalledWith({ workspace })
    expect(mockCheckFreeProviderQuota).not.toHaveBeenCalled() // Should fail before this check
  })
})
