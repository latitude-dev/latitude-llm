import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cacheModule from '../../cache'
import { LogSources } from '../../constants'
import { createProject } from '../../tests/factories'
import { getCachedResponse, setCachedResponse } from './promptCache'
import { ChainStepResponse, StreamType } from '@latitude-data/constants'

describe('promptCache', async () => {
  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
  }

  beforeEach(() => {
    // @ts-expect-error - mock
    vi.spyOn(cacheModule, 'cache').mockResolvedValue(mockCache)
    vi.clearAllMocks()
  })

  const { workspace } = await createProject()
  const config = { temperature: 0 }
  const conversation = { messages: [], config }
  const response = {
    streamType: 'text' as const,
    text: 'cached response',
    reasoning: undefined,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    toolCalls: [],
    // This should not be cached
    documentLogUuid: 'document-log-uuid',
    providerLog: {
      messages: [],
      id: 2565,
      workspaceId: 1,
      uuid: '0df332f6-8c70-4888-a381-63114818d7bf',
      documentLogUuid: 'c242aee1-084e-4b52-b837-06e6983fcc4b',
      experimentId: null,
      providerId: 2,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      config: { provider: 'openai', model: 'gpt-4o-mini' },
      responseObject: null,
      responseText: 'We do not care',
      responseReasoning: null,
      toolCalls: [],
      tokens: 399,
      costInMillicents: 13,
      duration: 2392,
      source: LogSources.SharedPrompt,
      apiKeyId: null,
      generatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  describe('getCachedResponse', () => {
    it('returns undefined when temperature is not 0', async () => {
      const result = await getCachedResponse({
        workspace,
        config: { temperature: 0.5 },
        conversation,
      })

      expect(result).toBeUndefined()
      expect(mockCache.get).not.toHaveBeenCalled()
    })

    it('returns cached response when available', async () => {
      mockCache.get.mockResolvedValueOnce(JSON.stringify(response))

      const result = await getCachedResponse({
        workspace,
        config,
        conversation,
      })

      expect(result).toEqual({
        ...response,
        providerLog: {
          ...response.providerLog,
          generatedAt: response.providerLog.generatedAt.toISOString(),
          createdAt: response.providerLog.createdAt.toISOString(),
          updatedAt: response.providerLog.updatedAt.toISOString(),
        },
      })
      expect(mockCache.get).toHaveBeenCalledTimes(1)
    })

    it('returns undefined when cache throws error', async () => {
      mockCache.get.mockRejectedValueOnce(new Error('Cache error'))

      const result = await getCachedResponse({
        workspace,
        config,
        conversation,
      })

      expect(result).toBeUndefined()
    })
  })

  describe('setCachedResponse', () => {
    it('does not cache when temperature is not 0', async () => {
      await setCachedResponse({
        workspace,
        config: { temperature: 0.5 },
        conversation,
        response: response as ChainStepResponse<StreamType>,
      })

      expect(mockCache.set).not.toHaveBeenCalled()
    })

    it('caches response when temperature is 0', async () => {
      await setCachedResponse({
        workspace,
        config,
        conversation,
        response: response as ChainStepResponse<StreamType>,
      })

      expect(mockCache.set).toHaveBeenCalledTimes(1)
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining(`workspace:${workspace.id}:prompt:`),
        JSON.stringify({
          streamType: 'text',
          text: 'cached response',
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
          toolCalls: [],
        }),
      )
    })

    it('throws error when streamType is invalid', async () => {
      await expect(
        setCachedResponse({
          workspace,
          config,
          conversation,
          response: {
            ...response,
            // @ts-expect-error - invalid streamType
            streamType: 'invalid',
          },
        }),
      ).rejects.toThrowError(
        'Invalid "streamType" response, it should be "text" or "object"',
      )
    })

    it('silently fails when cache throws error', async () => {
      mockCache.set.mockRejectedValueOnce(new Error('Cache error'))

      await expect(
        setCachedResponse({
          workspace,
          config,
          conversation,
          response,
        }),
      ).resolves.toBeUndefined()
    })
  })
})
