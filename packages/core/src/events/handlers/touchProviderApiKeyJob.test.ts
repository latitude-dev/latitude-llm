import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { touchProviderApiKeyJob } from './touchProviderApiKeyJob'
import { ProviderLogCreatedEvent } from '../events'
import * as providerApiKeyService from '../../services/providerApiKeys/touch'
import * as cacheModule from '../../cache'
import {
  createDocumentLog,
  createProject,
  helpers,
} from '../../tests/factories'
import { createProviderLog } from '../../tests/factories/providerLogs'
import { DocumentLog, ProviderApiKey, Workspace } from '../../schema/types'
import { Providers } from '@latitude-data/constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'

vi.mock('../../services/providerApiKeys/touch', () => ({
  touchProviderApiKey: vi.fn(),
}))

vi.mock('../../cache', () => ({
  cache: vi.fn(),
}))

describe('touchProviderApiKeyJob', () => {
  let documentLog: DocumentLog
  let workspace: Workspace
  let provider: ProviderApiKey

  const mockRedisGet = vi.fn()
  const mockRedisSet = vi.fn()
  const mockTouchProviderApiKey = vi.spyOn(
    providerApiKeyService,
    'touchProviderApiKey',
  )

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
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock Redis client
    vi.mocked(cacheModule.cache).mockResolvedValue({
      get: mockRedisGet,
      set: mockRedisSet,
    } as any)
  })

  it('should skip touching the provider API key if it was touched recently', async () => {
    // Create provider log with providerId
    const providerLog = await createProviderLog({
      workspace,
      providerId: provider.id,
      providerType: provider.provider,
      documentLogUuid: documentLog.uuid,
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

    await touchProviderApiKeyJob({ data: event })

    // Verify Redis get was called but not set
    expect(mockRedisGet).toHaveBeenCalledWith(
      `touch_provider_api_key:${provider.id}`,
    )
    expect(mockTouchProviderApiKey).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it('should touch the provider API key and update Redis if key was not touched recently', async () => {
    // Create provider log with providerId
    const providerLog = await createProviderLog({
      workspace,
      providerId: provider.id,
      providerType: provider.provider,
      documentLogUuid: generateUUIDIdentifier(),
    })

    // Mock Redis to return null (not touched recently)
    mockRedisGet.mockResolvedValue(null)

    // Mock touchProviderApiKey to return success
    mockTouchProviderApiKey.mockResolvedValue({
      ok: true,
      // @ts-ignore
      unwrap: () => ({ id: provider.id }),
    })

    // Create test event
    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: providerLog.id,
        workspaceId: workspace.id,
      },
    }

    await touchProviderApiKeyJob({ data: event })

    // Verify Redis and touchProviderApiKey were called
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
    // Create provider log with providerId
    const providerLog = await createProviderLog({
      workspace,
      providerId: provider.id,
      providerType: provider.provider,
      documentLogUuid: generateUUIDIdentifier(),
    })

    // Mock Redis to return null (not touched recently)
    mockRedisGet.mockResolvedValue(null)

    // Mock touchProviderApiKey to return failure
    // @ts-ignore
    mockTouchProviderApiKey.mockResolvedValue({ ok: false, unwrap: vi.fn() })

    // Create test event
    const event: ProviderLogCreatedEvent = {
      type: 'providerLogCreated',
      data: {
        id: providerLog.id,
        workspaceId: workspace.id,
      },
    }

    await touchProviderApiKeyJob({ data: event })

    // Verify Redis and touchProviderApiKey were called
    expect(mockRedisGet).toHaveBeenCalledWith(
      `touch_provider_api_key:${provider.id}`,
    )
    expect(mockTouchProviderApiKey).toHaveBeenCalledWith(provider.id)
    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})
