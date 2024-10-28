import * as factories from '@latitude-data/core/factories'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderApiKey, Workspace } from '../../browser'
import { database } from '../../client'
import { LogSources, Providers } from '../../constants'
import { generateUUIDIdentifier } from '../../lib'
import { apiKeys } from '../../schema'
import { createProviderLog, type CreateProviderLogProps } from './create'

let workspace: Workspace
let provider: ProviderApiKey
let providerProps: CreateProviderLogProps
let apiKeyId: number | undefined = undefined
let documentLogUuid: string | undefined

const publisherSpy = vi.spyOn(
  await import('../../events/publisher').then((f) => f.publisher),
  'publishLater',
)
describe('create provider', () => {
  beforeEach(async () => {
    const { workspace: wp, userData } = await factories.createWorkspace()
    workspace = wp
    provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'openai',
      user: userData,
    })
    providerProps = {
      workspace,
      uuid: generateUUIDIdentifier(),
      generatedAt: new Date(),
      providerId: provider.id,
      providerType: provider.provider,
      source: LogSources.API,
      model: 'gpt-4o',
      config: { model: 'gpt-4o' },
      apiKeyId,
      usage: { promptTokens: 3, completionTokens: 7, totalTokens: 10 },
      responseText: 'This is the response',
      messages: [],
      toolCalls: [],
      duration: 1000,
      documentLogUuid,
    }
  })

  it('creates provider log', async () => {
    const providerLog = await createProviderLog(providerProps).then((r) =>
      r.unwrap(),
    )
    expect(providerLog).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        costInMillicents: 7,
        tokens: 10,
        finishReason: 'stop',
        messages: [],
        toolCalls: [],
        model: 'gpt-4o',
        config: { model: 'gpt-4o' },
        responseObject: null,
        responseText: 'This is the response',
        source: 'api',
        documentLogUuid: null,
      }),
    )
  })

  it('publish event', async () => {
    const providerLog = await createProviderLog(providerProps).then((r) =>
      r.unwrap(),
    )
    expect(publisherSpy).toHaveBeenCalledWith({
      type: 'providerLogCreated',
      data: providerLog,
    })
  })

  it('touch latitude API key', async () => {
    const { apiKey } = await factories.createApiKey({
      name: 'MylatitudeAPIkey',
      workspace,
    })
    const providerLog = await createProviderLog({
      ...providerProps,
      apiKeyId: apiKey.id,
    }).then((r) => r.unwrap())

    const touchedApiKey = await database.query.apiKeys.findFirst({
      where: eq(apiKeys.id, apiKey.id),
    })
    expect(providerLog.apiKeyId).toEqual(apiKey.id)
    expect(touchedApiKey!.lastUsedAt).not.toBeNull()
  })

  it('assign costInMillicents', async () => {
    const providerLog = await createProviderLog({
      ...providerProps,
      costInMillicents: 100,
    }).then((r) => r.unwrap())
    expect(providerLog.costInMillicents).toEqual(100)
  })
})
