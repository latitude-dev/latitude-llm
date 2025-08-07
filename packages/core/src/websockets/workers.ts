import { env } from '@latitude-data/env'
import { generateWorkerWebsocketToken } from './utils'

export class WebsocketClient {
  private static instance: WebsocketClient
  private token: string | null = null
  private tokenExpiryTimestamp: number | null = null

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

  private isTokenExpired(): boolean {
    if (!this.token || !this.tokenExpiryTimestamp) return true

    // Add a 5-minute buffer before actual expiration to avoid edge cases
    const bufferMs = 5 * 60 * 1000
    return Date.now() >= this.tokenExpiryTimestamp - bufferMs
  }

  private async getToken(): Promise<string> {
    if (this.token && !this.isTokenExpired()) return this.token

    // Generate a new token if we don't have one or if it's expired/about to expire
    this.token = await generateWorkerWebsocketToken('1h')

    this.tokenExpiryTimestamp = Date.now() + 60 * 60 * 1000 // in 1 hour

    return this.token
  }

  async sendEvent(event: string, data: any): Promise<any> {
    // Try to send the event, with token refresh on failure
    return this.sendEventWithRetry(event, data, false)
  }

  private async sendEventWithRetry(event: string, data: any, isRetry: boolean): Promise<any> {
    const token = await this.getToken()

    try {
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

        // If we get an auth error and haven't retried yet, try refreshing the token
        if (
          !isRetry &&
          (response.status === 401 ||
            response.status === 403 ||
            error.error?.includes('exp claim timestamp check failed'))
        ) {
          // Force token refresh
          this.token = null
          this.tokenExpiryTimestamp = null

          // Retry once with a fresh token
          return this.sendEventWithRetry(event, data, true)
        }

        throw new Error(`Failed to send event: ${error.error}`)
      }

      return response.json()
    } catch (error) {
      // If this is already a retry attempt, propagate the error
      if (isRetry) throw error

      // For network errors on first attempt, try to refresh token and retry
      this.token = null
      this.tokenExpiryTimestamp = null
      return this.sendEventWithRetry(event, data, true)
    }
  }
}
