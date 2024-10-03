import { env } from '@latitude-data/env'
import { io, Socket } from 'socket.io-client'

import { WorkersClientToServerEvents } from './constants'
import { generateWorkerWebsocketToken } from './utils'

export type WorkerSocket = Socket<{}, WorkersClientToServerEvents>

export class WebsocketClient {
  private static instance: WebsocketClient
  private websockets: WorkerSocket

  static async getSocket(): Promise<WorkerSocket> {
    if (WebsocketClient.instance) return WebsocketClient.instance.websockets

    const token = await generateWorkerWebsocketToken()
    const websockets: WorkerSocket = io(`${env.WEBSOCKETS_SERVER}/workers`, {
      path: '/websocket',
      auth: { token },
      transports: ['websocket'],
    })
    const instance = new WebsocketClient(websockets)
    WebsocketClient.instance = instance
    return new Promise<WorkerSocket>((resolve) => {
      websockets.on('connect', () => {
        resolve(websockets)
      })
    })
  }

  constructor(websockets: Socket) {
    this.websockets = websockets
  }
}
