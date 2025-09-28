import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { touchApiKeyJob } from './touchApiKeyJob'
import { ProviderLogCreatedEvent } from '../events'
import * as apiKeyService from '../../services/apiKeys/touch'
import * as cacheModule from '../../cache'
import {
  createDocumentLog,
  createProject,
  helpers,
} from '../../tests/factories'
import { createProviderLog } from '../../tests/factories/providerLogs'
import { createApiKey } from '../../tests/factories/apiKeys'
import {
  ApiKey,
  DocumentLog,
  ProviderApiKey,
  Workspace,
} from '../../schema/types'
import { Providers } from '@latitude-data/constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'

vi.mock('../../services/apiKeys/touch', () => ({
  touchApiKey: vi.fn(),
}))

vi.mock('../../cache', () => ({
  cache: vi.fn(),
}))

describe('touchApiKeyJob', () => {
  let apiKey: ApiKey
  let documentLog: DocumentLog
  let workspace: Workspace
  let provider: ProviderApiKey

  const mockRedisGet = vi.fn()
  const mockRedisSet = vi.fn()
  const mockTouchApiKey = vi.spyOn(apiKeyService, 'touchApiKey')

  beforeAll(async () => {
    const {
      workspace: w,
      commit,
      documents: docs,
      providers,
    } = await createProject({
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
    const doc = docs[0]!
    const { documentLog: dl } = await createDocumentLog({
      document: doc,
      commit,
    })
    documentLog = dl

    const { apiKey: ak } = await createApiKey({ workspace })
    apiKey = ak
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock Redis client
    vi.mocked(cacheModule.cache).mockResolvedValue({
      get: mockRedisGet,
      set: mockRedisSet,
    } as any)
  })

  it('should skip touching the API key if it was touched recently', async () => {
    // Create provider log with apiKeyId
    const providerLog = await createProviderLog({
      workspace,
      providerId: provider.id,
      providerType: provider.provider,
      documentLogUuid: documentLog.uuid,
      apiKeyId: apiKey.id,
    })

    // Mock Redis to return a timestamp
    mockRedisGet.mockResolvedValue('some-timestamp')

    // Create test event
    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: providerLog.id,
        workspaceId: workspace.id,
      },
    }

    await touchApiKeyJob({ data: event })

    // Verify Redis get was called but not set
    expect(mockRedisGet).toHaveBeenCalledWith(`touch_api_key:${apiKey.id}`)
    expect(mockTouchApiKey).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it('should touch the API key and update Redis if key was not touched recently', async () => {
    // Create provider log with apiKeyId
    const providerLog = await createProviderLog({
      workspace,
      providerId: provider.id,
      providerType: provider.provider,
      documentLogUuid: generateUUIDIdentifier(),
      apiKeyId: apiKey.id,
    })

    // Mock Redis to return null (not touched recently)
    mockRedisGet.mockResolvedValue(null)

    // Mock touchApiKey to return success
    mockTouchApiKey.mockResolvedValue({
      ok: true,
      // @ts-ignore
      unwrap: () => ({ id: apiKey.id }),
    })

    // Create test event
    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: providerLog.id,
        workspaceId: workspace.id,
      },
    }

    await touchApiKeyJob({ data: event })

    // Verify Redis and touchApiKey were called
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
    // Create provider log with apiKeyId
    const providerLog = await createProviderLog({
      workspace,
      providerId: provider.id,
      providerType: provider.provider,
      documentLogUuid: generateUUIDIdentifier(),
      apiKeyId: apiKey.id,
    })

    // Mock Redis to return null (not touched recently)
    mockRedisGet.mockResolvedValue(null)

    // Mock touchApiKey to return failure
    // @ts-ignore
    mockTouchApiKey.mockResolvedValue({ ok: false, unwrap: vi.fn() })

    // Create test event
    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: providerLog.id,
        workspaceId: workspace.id,
      },
    }

    await touchApiKeyJob({ data: event })

    // Verify Redis and touchApiKey were called
    expect(mockRedisGet).toHaveBeenCalledWith(`touch_api_key:${apiKey.id}`)
    expect(mockTouchApiKey).toHaveBeenCalledWith(apiKey.id)
    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})
