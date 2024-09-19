import { env } from '@latitude-data/env'
import { io, Socket } from 'socket.io-client'

import { WorkersClientToServerEvents } from './constants'
import { generateWorkerWebsocketToken } from './utils'

type WorkerSocket = Socket<{}, WorkersClientToServerEvents>

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
        console.log('Workers connected to WebSocket server')
        resolve(websockets)
      })

      websockets.on('connect_error', (error) => {
        console.error(
          'Error connecting to WebSocket server from WORKERS:',
          error,
        )
        resolve(websockets)
      })
    })
  }

  constructor(websockets: Socket) {
    this.websockets = websockets
  }
}
