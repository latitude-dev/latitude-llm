import Redis from 'ioredis'
import { env } from '@latitude-data/env'

export class WebsocketClient {
  private static instance: WebsocketClient
  private redis: Redis | null = null

  static getInstance(): WebsocketClient {
    if (WebsocketClient.instance) return WebsocketClient.instance

    const instance = new WebsocketClient()
    WebsocketClient.instance = instance
    return instance
  }

  private async getRedisClient() {
    if (!this.redis) {
      this.redis = new Redis({
        host: env.QUEUE_HOST,
        port: env.QUEUE_PORT,
        password: env.QUEUE_PASSWORD,
      })
    }
    return this.redis
  }

  // FIXME: Improve types. This is not safe and `any` avoid us moving to `strict` mode
  static async sendEvent(event: string, data: any): Promise<any> {
    const instance = WebsocketClient.getInstance()
    return instance.sendEvent(event, data)
  }

  async sendEvent(event: string, data: any): Promise<any> {
    try {
      const redis = await this.getRedisClient()

      // Create workspace-specific channel
      const channel = `websocket:workspace:${data.workspaceId}`

      // Create message payload
      const message = JSON.stringify({
        event,
        workspaceId: data.workspaceId,
        data: data.data,
        timestamp: Date.now(),
      })

      // Publish to Redis channel - guarantees FIFO ordering per workspace channel
      await redis.publish(channel, message)

      return { success: true, channel }
    } catch (error) {
      console.error('Error publishing WebSocket event:', error)
      throw new Error(`Failed to publish WebSocket event: ${error}`)
    }
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  async close(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect()
      this.redis = null
    }
  }
}
