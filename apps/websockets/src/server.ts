import http from 'http'

import {
  buildWorkspaceRoom,
  verifyWebsocketToken,
} from '@latitude-data/core/websockets/utils'
import { env } from '@latitude-data/env'
import cookieParser from 'cookie-parser'
import express from 'express'
import { Namespace, Server, Socket } from 'socket.io'
import Redis from 'ioredis'
import {
  TOKEN_TYPES,
  WebClientToServerEvents,
  WebServerToClientEvents,
  WebSocketData,
} from '@latitude-data/core/websockets/constants'

function parseCookie(cookieString: string): Record<string, string> {
  return cookieString.split(';').reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split('=')
      if (!key || !value) return acc

      acc[key] = decodeURIComponent(value)
      return acc
    },
    {} as Record<string, string>,
  )
}

const app = express()
app.use(cookieParser())

app.get('/health', (_, res) => {
  res.json({ status: 'Websockets server running' })
})

const server = http.createServer(app)
const io = new Server(server, {
  path: '/websocket',
  cors: {
    origin: env.APP_URL,
    credentials: true,
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket: Socket) => {
  // Main namespace is not enabled. Connect to /web instead.
  socket.disconnect()
})

const web: Namespace<
  WebClientToServerEvents,
  WebServerToClientEvents,
  {},
  WebSocketData
> = io.of('/web')

web.use(async (socket, next) => {
  try {
    const cookieHeader = socket.request.headers.cookie

    if (!cookieHeader) {
      return next(new Error('Authentication error: No cookies provided'))
    }

    const cookies = parseCookie(cookieHeader)
    const token = cookies[TOKEN_TYPES.websocket]

    if (!token) {
      return next(new Error('AUTH_ERROR: No token provided'))
    }

    const result = await verifyWebsocketToken({ token, type: 'websocket' })

    if (result.error) {
      return next(new Error(`AUTH_ERROR: ${result.error.message}`))
    }

    const payload = result.value.payload

    socket.data = {
      userId: payload.userId,
      workspaceId: payload.workspaceId,
    }

    return next()
  } catch (_err) {
    return next(new Error('AUTH_ERROR: Verification failed'))
  }
})

web.on('connection', (socket) => {
  socket.on('joinWorkspace', ({ workspaceId, userId }) => {
    if (
      socket.data.userId === userId &&
      socket.data.workspaceId === workspaceId
    ) {
      const room = buildWorkspaceRoom({ workspaceId })
      socket.join(room)
    }
  })
})

// Initialize Redis subscriber for WebSocket events
async function initializeRedisSubscriber() {
  const subscriber = new Redis({
    host: env.QUEUE_HOST,
    port: env.QUEUE_PORT,
    password: env.QUEUE_PASSWORD,
  })

  // Subscribe to all workspace WebSocket channels
  await subscriber.psubscribe('websocket:workspace:*')

  subscriber.on(
    'pmessage',
    (_pattern: string, channel: string, message: string) => {
      try {
        // Extract workspace ID from channel name
        const workspaceId = parseInt(channel.split(':')[2])

        // Parse message
        const { event, data } = JSON.parse(message)

        // Emit to workspace room
        const room = buildWorkspaceRoom({ workspaceId })
        web.to(room).emit(event as any, data)
      } catch (error) {
        console.error('Error processing WebSocket event:', error)
      }
    },
  )

  subscriber.on('error', (error: Error) => {
    console.error('Redis subscriber error:', error)
  })

  console.log('Redis WebSocket subscriber initialized')
  return subscriber
}

// Initialize subscriber
let redisSubscriber: Redis
initializeRedisSubscriber()
  .then((subscriber) => {
    redisSubscriber = subscriber
  })
  .catch((error) => {
    console.error('Failed to initialize Redis subscriber:', error)
  })

const PORT = process.env.WEBSOCKETS_SERVER_PORT || 4002

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`)
})

server.on('error', (err) => {
  console.error('Socket.IO server error:', err)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down WebSocket server...')
  if (redisSubscriber) {
    redisSubscriber.disconnect()
  }
  server.close()
})

process.on('SIGINT', async () => {
  console.log('Shutting down WebSocket server...')
  if (redisSubscriber) {
    redisSubscriber.disconnect()
  }
  server.close()
})
