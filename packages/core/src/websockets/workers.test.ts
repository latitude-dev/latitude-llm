import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WebsocketClient } from './workers'

// Mock ioredis
vi.mock('ioredis', () => ({
  default: class MockRedis {
    publish = vi.fn()
    disconnect = vi.fn()
  },
}))

describe('WebsocketClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendEvent', () => {
    it('should publish a WebSocket event to Redis channel', async () => {
      const testEvent = 'latteThreadUpdate'
      const testData = {
        workspaceId: 123,
        data: {
          threadUuid: 'test-thread',
          type: 'toolStarted',
          toolCallId: 'tool-123',
          toolName: 'test-tool',
        },
      }

      const client = WebsocketClient.getInstance()
      const result = await client.sendEvent(testEvent, testData)

      // Get the Redis instance to check the call
      const redisInstance = await (client as any).getRedisClient()

      // Verify the Redis publish was called with correct parameters
      expect(redisInstance.publish).toHaveBeenCalledWith(
        'websocket:workspace:123',
        expect.stringContaining('"event":"latteThreadUpdate"'),
      )

      // Parse the message to verify structure
      const publishCall = redisInstance.publish.mock.calls[0]
      const channel = publishCall[0]
      const message = JSON.parse(publishCall[1])

      expect(channel).toBe('websocket:workspace:123')
      expect(message).toMatchObject({
        event: testEvent,
        workspaceId: testData.workspaceId,
        data: testData.data,
        timestamp: expect.any(Number),
      })

      // Verify the result
      expect(result).toEqual({
        success: true,
        channel: 'websocket:workspace:123',
      })
    })

    it('should handle Redis publish errors gracefully', async () => {
      // Mock Redis to throw error on publish
      const publishError = new Error('Redis connection failed')

      // Create a new instance and spy on it
      const client = WebsocketClient.getInstance()
      const redisInstance = await (client as any).getRedisClient()
      redisInstance.publish.mockRejectedValue(publishError)

      const testEvent = 'latteThreadUpdate'
      const testData = {
        workspaceId: 123,
        data: { message: 'test' },
      }

      await expect(client.sendEvent(testEvent, testData)).rejects.toThrow(
        'Failed to publish WebSocket event: Error: Redis connection failed',
      )
    })

    it('should maintain singleton instance', () => {
      const instance1 = WebsocketClient.getInstance()
      const instance2 = WebsocketClient.getInstance()

      expect(instance1).toBe(instance2)
    })
  })
})
