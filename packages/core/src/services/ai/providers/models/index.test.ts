import { beforeEach, describe, expect, it } from 'vitest'

import { type ProviderApiKey } from '../../../../schema/models/types/ProviderApiKey'
import { findFirstModelForProvider, listModelsForProvider } from './index'
import { Providers } from '@latitude-data/constants'

describe('findFirstModelForProvider', () => {
  let provider: ProviderApiKey

  beforeEach(async () => {
    provider = {
      id: 31,
      name: 'fake-name',
      token: 'fake-token',
      provider: Providers.OpenAI,
      url: null,
      defaultModel: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      authorId: '1',
      workspaceId: 1,
      lastUsedAt: null,
      deletedAt: null,
      configuration: null,
    }
  })

  it('returns no model for no provider', async () => {
    const result = findFirstModelForProvider({})

    expect(result).toBeUndefined()
  })

  it('returns default model for provider with default model set', async () => {
    provider.provider = Providers.OpenAI
    provider.defaultModel = 'gpt-4o'

    const result = findFirstModelForProvider({ provider })

    expect(result).toBe('gpt-4o')
  })

  it('returns first model for provider without default model set', async () => {
    provider.provider = Providers.Anthropic
    provider.defaultModel = null

    const result = findFirstModelForProvider({ provider })

    const anthropicModels = Object.values(
      listModelsForProvider({ provider: Providers.Anthropic }),
    )
    expect(result).toBe(anthropicModels[0]?.id)
  })

  it('returns first model for provider when default model is not available', async () => {
    provider.provider = Providers.Anthropic
    provider.defaultModel = 'non-existent-model'

    const result = findFirstModelForProvider({ provider })

    const anthropicModels = Object.values(
      listModelsForProvider({ provider: Providers.Anthropic }),
    )
    expect(result).toBe(anthropicModels[0]?.id)
  })

  it('returns default model for custom provider with default model set', async () => {
    provider.provider = Providers.Custom
    provider.defaultModel = 'custom-model'

    const result = findFirstModelForProvider({ provider })

    expect(result).toBe('custom-model')
  })

  it('returns no model for custom provider without default model set', async () => {
    provider.provider = Providers.Custom
    provider.defaultModel = null

    const result = findFirstModelForProvider({ provider })

    expect(result).toBeUndefined()
  })
})
