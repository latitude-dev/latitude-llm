import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cacheModule from '../../cache'
import { createProject } from '../../tests/factories'
import { getCachedResponse, setCachedResponse } from './promptCache'

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
    streamType: 'text',
    text: 'cached response',
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    toolCalls: [],
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

      expect(result).toEqual(response)
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
        // @ts-expect-error - mock
        response,
      })

      expect(mockCache.set).not.toHaveBeenCalled()
    })

    it('caches response when temperature is 0', async () => {
      await setCachedResponse({
        workspace,
        config,
        conversation,
        // @ts-expect-error - mock
        response,
      })

      expect(mockCache.set).toHaveBeenCalledTimes(1)
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining(`workspace:${workspace.id}:prompt:`),
        JSON.stringify(response),
      )
    })

    it('silently fails when cache throws error', async () => {
      mockCache.set.mockRejectedValueOnce(new Error('Cache error'))

      await expect(
        setCachedResponse({
          workspace,
          config,
          conversation,
          // @ts-expect-error - mock
          response,
        }),
      ).resolves.toBeUndefined()
    })
  })
})
