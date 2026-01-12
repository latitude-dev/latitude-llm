import { Providers } from '@latitude-data/constants'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as cacheModule from '../../cache'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as providerApiKeyService from '../../services/providerApiKeys/touch'
import { createProject, helpers } from '../../tests/factories'
import { ProviderLogCreatedEvent } from '../events'
import { touchProviderApiKeyJob } from './touchProviderApiKeyJob'

vi.mock('../../services/providerApiKeys/touch', () => ({
  touchProviderApiKey: vi.fn(),
}))

vi.mock('../../cache', () => ({
  cache: vi.fn(),
}))

describe('touchProviderApiKeyJob', () => {
  let workspace: Workspace
  let provider: ProviderApiKey

  const mockRedisGet = vi.fn()
  const mockRedisSet = vi.fn()
  const mockTouchProviderApiKey = vi.spyOn(
    providerApiKeyService,
    'touchProviderApiKey',
  )

  beforeAll(async () => {
    const { workspace: w, providers } = await createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        doc: helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    workspace = w
    provider = providers[0]!
  })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(cacheModule.cache).mockResolvedValue({
      get: mockRedisGet,
      set: mockRedisSet,
    } as any)
  })

  it('should skip if providerId is not present in event', async () => {
    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: 1,
        workspaceId: workspace.id,
      },
    }

    await touchProviderApiKeyJob({ data: event })

    expect(mockRedisGet).not.toHaveBeenCalled()
    expect(mockTouchProviderApiKey).not.toHaveBeenCalled()
  })

  it('should skip touching the provider API key if it was touched recently', async () => {
    mockRedisGet.mockResolvedValue('some-timestamp')

    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: 1,
        workspaceId: workspace.id,
        providerId: provider.id,
      },
    }

    await touchProviderApiKeyJob({ data: event })

    expect(mockRedisGet).toHaveBeenCalledWith(
      `touch_provider_api_key:${provider.id}`,
    )
    expect(mockTouchProviderApiKey).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it('should touch the provider API key and update Redis if key was not touched recently', async () => {
    mockRedisGet.mockResolvedValue(null)

    mockTouchProviderApiKey.mockResolvedValue({
      ok: true,
      // @ts-ignore
      unwrap: () => ({ id: provider.id }),
    })

    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: 1,
        workspaceId: workspace.id,
        providerId: provider.id,
      },
    }

    await touchProviderApiKeyJob({ data: event })

    expect(mockRedisGet).toHaveBeenCalledWith(
      `touch_provider_api_key:${provider.id}`,
    )
    expect(mockTouchProviderApiKey).toHaveBeenCalledWith(provider.id)
    expect(mockRedisSet).toHaveBeenCalledWith(
      `touch_provider_api_key:${provider.id}`,
      expect.any(String),
      'EX',
      5,
    )
  })

  it('should not update Redis if touchProviderApiKey fails', async () => {
    mockRedisGet.mockResolvedValue(null)

    // @ts-ignore
    mockTouchProviderApiKey.mockResolvedValue({ ok: false, unwrap: vi.fn() })

    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: 1,
        workspaceId: workspace.id,
        providerId: provider.id,
      },
    }

    await touchProviderApiKeyJob({ data: event })

    expect(mockRedisGet).toHaveBeenCalledWith(
      `touch_provider_api_key:${provider.id}`,
    )
    expect(mockTouchProviderApiKey).toHaveBeenCalledWith(provider.id)
    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})
