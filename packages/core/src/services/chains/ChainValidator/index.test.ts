import { Providers } from '@latitude-data/constants'
import { createChain } from 'promptl-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Workspace } from '../../../browser'
import { Result } from '../../../lib/Result'
import { validateChain } from './index'
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
