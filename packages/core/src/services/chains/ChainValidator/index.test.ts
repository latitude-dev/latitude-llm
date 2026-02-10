import { Providers } from '@latitude-data/constants'
import { PaymentRequiredError } from '@latitude-data/constants/errors'
import { createChain } from 'promptl-ai'
import { addDays, subDays } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type WorkspaceDto } from '../../../schema/models/types/Workspace'
import { SubscriptionPlan, isPayingOrTrialing } from '../../../plans'
import { Result } from '../../../lib/Result'
import { applyAgentRule, validateChain } from './index'
import { checkPayingOrTrial } from '../../../lib/checkPayingOrTrial'
import * as checkFreeProviderQuotaModule from '../checkFreeProviderQuota'
import * as checkPayingOrTrialModule from '../../../lib/checkPayingOrTrial'

describe('validateChain - Plan Limits', () => {
  let workspace: WorkspaceDto
  let providersMap: Map<string, any>
  let mockCheckFreeProviderQuota: any
  let mockCheckPayingOrTrial: any

  beforeEach(() => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    // Mock workspace with currentSubscription
    workspace = {
      id: 1,
      uuid: 'test-uuid',
      name: 'Test Workspace',
      createdAt: new Date(),
      updatedAt: new Date(),
      creatorId: '1',
      currentSubscriptionId: 1,
      defaultProviderId: null,
      currentSubscription: {
        id: 1,
        workspaceId: 1,
        plan: SubscriptionPlan.HobbyV3,
        trialEndsAt: addDays(new Date(), 15),
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as WorkspaceDto

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

    // Mock checkFreeProviderQuota to avoid database calls
    mockCheckFreeProviderQuota = vi.fn().mockResolvedValue(Result.nil())
    vi.spyOn(
      checkFreeProviderQuotaModule,
      'checkFreeProviderQuota',
    ).mockImplementation(mockCheckFreeProviderQuota)

    // Mock checkPayingOrTrial by default to allow requests
    mockCheckPayingOrTrial = vi.fn().mockReturnValue(Result.nil())
    vi.spyOn(checkPayingOrTrialModule, 'checkPayingOrTrial').mockImplementation(
      mockCheckPayingOrTrial,
    )
  })

  it('Check that free quota is called', async () => {
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
    expect(mockCheckFreeProviderQuota).toHaveBeenCalled()
  })

  it('Check that paying or trial check is called', async () => {
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
    expect(mockCheckPayingOrTrial).toHaveBeenCalledWith({
      subscription: workspace.currentSubscription,
    })
  })

  it('Check that paying or trial check is called before free quota check', async () => {
    const callOrder: string[] = []

    mockCheckPayingOrTrial = vi.fn().mockImplementation(() => {
      callOrder.push('checkPayingOrTrial')
      return Result.nil()
    })
    vi.spyOn(checkPayingOrTrialModule, 'checkPayingOrTrial').mockImplementation(
      mockCheckPayingOrTrial,
    )

    mockCheckFreeProviderQuota = vi.fn().mockImplementation(() => {
      callOrder.push('checkFreeProviderQuota')
      return Promise.resolve(Result.nil())
    })
    vi.spyOn(
      checkFreeProviderQuotaModule,
      'checkFreeProviderQuota',
    ).mockImplementation(mockCheckFreeProviderQuota)

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

    await validateChain({
      workspace,
      providersMap,
      chain,
      newMessages: undefined,
    })

    expect(callOrder).toEqual(['checkPayingOrTrial', 'checkFreeProviderQuota'])
  })

  it('Returns PaymentRequiredError when trial has ended', async () => {
    mockCheckPayingOrTrial = vi
      .fn()
      .mockReturnValue(
        Result.error(
          new PaymentRequiredError(
            'Your trial has ended. Please upgrade to continue using Latitude.',
          ),
        ),
      )
    vi.spyOn(checkPayingOrTrialModule, 'checkPayingOrTrial').mockImplementation(
      mockCheckPayingOrTrial,
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
    expect(result.error?.code).toBe('payment_required_error')
    expect(mockCheckFreeProviderQuota).not.toHaveBeenCalled()
  })
})

describe('isPayingOrTrialing', () => {
  it('returns true for paying plans', () => {
    const result = isPayingOrTrialing({
      plan: SubscriptionPlan.TeamV4,
      trialEndsAt: null,
    })

    expect(result).toBe(true)
  })

  it('returns true for free plans in active trial', () => {
    const result = isPayingOrTrialing({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt: addDays(new Date(), 15),
    })

    expect(result).toBe(true)
  })

  it('returns false for free plans with ended trial', () => {
    const result = isPayingOrTrialing({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt: subDays(new Date(), 5),
    })

    expect(result).toBe(false)
  })
})

describe('checkPayingOrTrial - direct tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('allows requests for paying plans', () => {
    const subscription = {
      id: 1,
      workspaceId: 1,
      plan: SubscriptionPlan.TeamV4,
      trialEndsAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = checkPayingOrTrial({ subscription })

    expect(result.ok).toBe(true)
  })

  it('allows requests for free plans in active trial', () => {
    const subscription = {
      id: 1,
      workspaceId: 1,
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt: addDays(new Date(), 15),
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = checkPayingOrTrial({ subscription })

    expect(result.ok).toBe(true)
  })

  it('rejects requests for free plans with ended trial', () => {
    const subscription = {
      id: 1,
      workspaceId: 1,
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt: subDays(new Date(), 5),
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = checkPayingOrTrial({ subscription })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(PaymentRequiredError)
  })
})

describe('applyAgentRule', () => {
  it('applies default maxSteps to regular prompts without maxSteps', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-4o',
    }

    const result = applyAgentRule(config)

    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      maxSteps: 20,
    })
  })

  it('applies default maxSteps to agent prompts without maxSteps', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-4o',
      type: 'agent' as const,
    }

    const result = applyAgentRule(config)

    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      type: 'agent',
      maxSteps: 20,
    })
  })

  it('respects custom maxSteps when explicitly set in regular prompt', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-4o',
      maxSteps: 50,
    }

    const result = applyAgentRule(config)

    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      maxSteps: 50,
    })
  })

  it('respects custom maxSteps when explicitly set in agent prompt', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-4o',
      type: 'agent' as const,
      maxSteps: 100,
    }

    const result = applyAgentRule(config)

    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      type: 'agent',
      maxSteps: 100,
    })
  })

  it('preserves other config properties when applying maxSteps', () => {
    const config = {
      provider: 'anthropic',
      model: 'claude-3-opus',
      temperature: 0.7,
      tools: ['tool1', 'tool2'],
    }

    const result = applyAgentRule(config)

    expect(result).toEqual({
      provider: 'anthropic',
      model: 'claude-3-opus',
      temperature: 0.7,
      tools: ['tool1', 'tool2'],
      maxSteps: 20,
    })
  })

  it('does not apply maxSteps when type is explicitly set to prompt', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-4o',
      type: 'prompt' as const,
    }

    const result = applyAgentRule(config)

    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      type: 'prompt',
    })
  })

  it('does not apply maxSteps when type: prompt even with other config', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-4o',
      type: 'prompt' as const,
      temperature: 0.5,
      tools: ['tool1'],
    }

    const result = applyAgentRule(config)

    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      type: 'prompt',
      temperature: 0.5,
      tools: ['tool1'],
    })
  })
})
