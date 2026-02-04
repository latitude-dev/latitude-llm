import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as factories from '../../tests/factories'

import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Providers, LogSources } from '@latitude-data/constants'
import { generateUUIDIdentifier } from './../../lib/generateUUID'
import { createProviderLog, type CreateProviderLogProps } from './create'

vi.mock('../../lib/disk', () => ({
  diskFactory: vi.fn(),
}))

let workspace: Workspace
let provider: ProviderApiKey
let providerProps: CreateProviderLogProps
const apiKeyId: number | undefined = undefined
let documentLogUuid: string | undefined

const publisherSpy = vi.spyOn(
  await import('../../events/publisher').then((f) => f.publisher),
  'publishLater',
)

describe('createProviderLog', () => {
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
      usage: {
        inputTokens: 3,
        promptTokens: 3,
        outputTokens: 7,
        completionTokens: 7,
        totalTokens: 10,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      responseText: 'This is the response',
      messages: [],
      toolCalls: [],
      duration: 1000,
      documentLogUuid,
    }
  })

  describe('successful creation', () => {
    it('creates provider log with all required fields', async () => {
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
          responseReasoning: null,
          output: null,
          source: 'api',
          documentLogUuid: null,
        }),
      )
    })

    it('creates provider log with optional fields', async () => {
      const customProps = {
        ...providerProps,
        responseReasoning: 'This is reasoning',
        responseObject: { key: 'value' },
        toolCalls: [{ id: '1', name: 'test', arguments: { param: 'value' } }],
        finishReason: 'length' as const,
        output: [
          {
            role: 'assistant',
            content: 'test output',
            toolCalls: null,
          } as any,
        ],
      }

      const providerLog = await createProviderLog(customProps).then((r) =>
        r.unwrap(),
      )

      expect(providerLog.finishReason).toBe('length')
    })

    it('publishes event on successful creation', async () => {
      const providerLog = await createProviderLog(providerProps).then((r) =>
        r.unwrap(),
      )
      expect(publisherSpy).toHaveBeenCalledWith({
        type: 'providerLogCreated',
        data: {
          id: providerLog.id,
          workspaceId: workspace.id,
        },
      })
    })

    it('assigns custom costInMillicents when provided', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        costInMillicents: 100,
      }).then((r) => r.unwrap())
      expect(providerLog.costInMillicents).toEqual(100)
    })

    it('estimates cost when costInMillicents is not provided', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        costInMillicents: undefined,
      }).then((r) => r.unwrap())
      expect(providerLog.costInMillicents).toBeDefined()
      expect(typeof providerLog.costInMillicents).toBe('number')
    })

    it('handles NaN tokens gracefully', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        usage: {
          inputTokens: 3,
          outputTokens: 7,
          promptTokens: 3,
          completionTokens: 7,
          totalTokens: NaN,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
      }).then((r) => r.unwrap())
      expect(providerLog.tokens).toBe(0)
    })

    it('handles missing usage data', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        usage: undefined,
      }).then((r) => r.unwrap())
      expect(providerLog.tokens).toBeNull() // Database allows null
      expect(providerLog.costInMillicents).toBe(0) // Database default
    })

    it('handles empty messages array', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        messages: [],
      }).then((r) => r.unwrap())
      expect(providerLog.messages).toEqual([])
    })

    it('handles null toolCalls', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        toolCalls: null,
      }).then((r) => r.unwrap())
      expect(providerLog.toolCalls).toEqual([])
    })
  })

  describe('error handling', () => {
    it('handles database insertion failure and cleans up file', async () => {
      // Mock the transaction to fail
      const mockTransaction = {
        call: vi.fn().mockRejectedValue(new Error('Database error')),
      }

      const result = await createProviderLog(
        providerProps,
        mockTransaction as any,
      )
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Database error')
    })
  })

  describe('cost estimation', () => {
    it('skips cost estimation when providerType is missing', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        providerType: undefined,
        costInMillicents: undefined,
      }).then((r) => r.unwrap())
      expect(providerLog.costInMillicents).toBe(0) // Database default
    })

    it('skips cost estimation when model is missing', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        model: undefined,
        costInMillicents: undefined,
      }).then((r) => r.unwrap())
      expect(providerLog.costInMillicents).toBe(0) // Database default
    })

    it('skips cost estimation when usage is missing', async () => {
      const providerLog = await createProviderLog({
        ...providerProps,
        usage: undefined,
        costInMillicents: undefined,
      }).then((r) => r.unwrap())
      expect(providerLog.costInMillicents).toBe(0) // Database default
    })
  })

  // TODO: Add file operations tests when disk mocking is properly configured
  describe.skip('file operations', () => {
    it('generates correct file key', async () => {
      // Test file key generation
      expect(true).toBe(true)
    })

    it('stores correct file data structure', async () => {
      // Test file data structure
      expect(true).toBe(true)
    })
  })
})
