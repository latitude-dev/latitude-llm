import { env } from '@latitude-data/env'
import { generateWorkerWebsocketToken } from './utils'

export class WebsocketClient {
  private static instance: WebsocketClient
  private token: string | null = null

  static async getInstance(): Promise<WebsocketClient> {
    if (WebsocketClient.instance) return WebsocketClient.instance

    const instance = new WebsocketClient()
    WebsocketClient.instance = instance
    return instance
  }

  static async sendEvent(event: string, data: any) {
    const instance = await WebsocketClient.getInstance()
    return instance.sendEvent(event, data)
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token

    this.token = await generateWorkerWebsocketToken()
    return this.token
  }

  async sendEvent(event: string, data: any) {
    const token = await this.getToken()
    const response = await fetch(`${env.WEBSOCKETS_SERVER}/worker-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event,
        workspaceId: data.workspaceId,
        data: data.data,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to send event: ${error.error}`)
    }

    return response.json()
  }
}
