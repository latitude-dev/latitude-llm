import { Providers } from '@latitude-data/constants'
import { createChain } from 'promptl-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Workspace } from '../../../schema/types'
import { Result } from '../../../lib/Result'
import { applyAgentRule, validateChain } from './index'
import * as checkFreeProviderQuotaModule from '../checkFreeProviderQuota'

describe('validateChain - Plan Limits', () => {
  let workspace: Workspace
  let providersMap: Map<string, any>
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

    // Mock checkFreeProviderQuota to avoid database calls
    mockCheckFreeProviderQuota = vi.fn().mockResolvedValue(Result.nil())
    vi.spyOn(
      checkFreeProviderQuotaModule,
      'checkFreeProviderQuota',
    ).mockImplementation(mockCheckFreeProviderQuota)
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
