import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cacheModule from '../../cache'
import { createProject } from '../../tests/factories'
import { getCachedResponse, setCachedResponse } from './promptCache'
import {
  ChainStepResponse,
  Providers,
  StreamType,
} from '@latitude-data/constants'

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
    input: [],
    model: 'gpt-4o-mini',
    provider: Providers.OpenAI,
    cost: 0,
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
    documentLogUuid: 'document-log-uuid',
  }
  const { documentLogUuid: _documentLogUuid, ...cachedResponse } = response

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
      mockCache.get.mockResolvedValueOnce(JSON.stringify(cachedResponse))

      const result = await getCachedResponse({
        workspace,
        config,
        conversation,
      })

      expect(result).toEqual(cachedResponse)
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
          input: [],
          model: 'gpt-4o-mini',
          provider: Providers.OpenAI,
          cost: 0,
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
