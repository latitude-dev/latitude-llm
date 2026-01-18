import { Providers } from '@latitude-data/constants'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as cacheModule from '../../cache'
import { type ApiKey } from '../../schema/models/types/ApiKey'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as apiKeyService from '../../services/apiKeys/touch'
import { createProject, helpers } from '../../tests/factories'
import { createApiKey } from '../../tests/factories/apiKeys'
import { ProviderLogCreatedEvent } from '../events'
import { touchApiKeyJob } from './touchApiKeyJob'

vi.mock('../../services/apiKeys/touch', () => ({
  touchApiKey: vi.fn(),
}))

vi.mock('../../cache', () => ({
  cache: vi.fn(),
}))

describe('touchApiKeyJob', () => {
  let apiKey: ApiKey
  let workspace: Workspace

  const mockRedisGet = vi.fn()
  const mockRedisSet = vi.fn()
  const mockTouchApiKey = vi.spyOn(apiKeyService, 'touchApiKey')

  beforeAll(async () => {
    const { workspace: w } = await createProject({
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

    const { apiKey: ak } = await createApiKey({ workspace })
    apiKey = ak
  })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(cacheModule.cache).mockResolvedValue({
      get: mockRedisGet,
      set: mockRedisSet,
    } as any)
  })

  it('should skip if apiKeyId is not present in event', async () => {
    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: 1,
        workspaceId: workspace.id,
      },
    }

    await touchApiKeyJob({ data: event })

    expect(mockRedisGet).not.toHaveBeenCalled()
    expect(mockTouchApiKey).not.toHaveBeenCalled()
  })

  it('should skip touching the API key if it was touched recently', async () => {
    mockRedisGet.mockResolvedValue('some-timestamp')

    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: 1,
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
      },
    }

    await touchApiKeyJob({ data: event })

    expect(mockRedisGet).toHaveBeenCalledWith(`touch_api_key:${apiKey.id}`)
    expect(mockTouchApiKey).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it('should touch the API key and update Redis if key was not touched recently', async () => {
    mockRedisGet.mockResolvedValue(null)

    mockTouchApiKey.mockResolvedValue({
      ok: true,
      // @ts-ignore
      unwrap: () => ({ id: apiKey.id }),
    })

    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: 1,
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
      },
    }

    await touchApiKeyJob({ data: event })

    expect(mockRedisGet).toHaveBeenCalledWith(`touch_api_key:${apiKey.id}`)
    expect(mockTouchApiKey).toHaveBeenCalledWith(apiKey.id)
    expect(mockRedisSet).toHaveBeenCalledWith(
      `touch_api_key:${apiKey.id}`,
      expect.any(String),
      'EX',
      5,
    )
  })

  it('should not update Redis if touchApiKey fails', async () => {
    mockRedisGet.mockResolvedValue(null)

    // @ts-ignore
    mockTouchApiKey.mockResolvedValue({ ok: false, unwrap: vi.fn() })

    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: 1,
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
      },
    }

    await touchApiKeyJob({ data: event })

    expect(mockRedisGet).toHaveBeenCalledWith(`touch_api_key:${apiKey.id}`)
    expect(mockTouchApiKey).toHaveBeenCalledWith(apiKey.id)
    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})
