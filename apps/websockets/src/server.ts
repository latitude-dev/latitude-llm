import http from 'http'

import {
  TOKEN_TYPES,
  WebClientToServerEvents,
  WebServerToClientEvents,
  WebSocketData,
  WorkersClientToServerEvents,
} from '@latitude-data/core/browser'
import {
  buildWorkspaceRoom,
  verifyWebsocketToken,
  verifyWorkerWebsocketToken,
} from '@latitude-data/core/websockets/utils'
import { env } from '@latitude-data/env'
import cookieParser from 'cookie-parser'
import express from 'express'
import { Namespace, Server, Socket } from 'socket.io'

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
    origin: env.LATITUDE_URL,
    credentials: true,
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket: Socket) => {
  console.log(
    'Main namespace is not enabled. Connect to /web or /workers instead.',
  )
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
  } catch (err) {
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

const workers: Namespace<WorkersClientToServerEvents> = io.of('/workers')
workers.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token
    if (!token) {
      return next(new Error('Authentication error: No token provided'))
    }

    const result = await verifyWorkerWebsocketToken(token)

    if (result.error) {
      return next(new Error(`Authentication error: ${result.error.message}`))
    }

    return next()
  } catch (err) {
    console.error('JWT verification failed for worker:', err)
    return next(new Error('Authentication error'))
  }
})

workers.on('connection', (socket) => {
  console.log('DEBUG: Worker connected')

  socket.on('evaluationStatus', (args) => {
    console.log('DEBUG: Evaluation STATUS %s', args)
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('evaluationStatus', data)
  })

  socket.on('disconnect', () => {
    console.log('Worker disconnected')
  })
})

const PORT = process.env.WEBSOCKETS_SERVER_PORT || 4002

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`)
})

server.on('error', (err) => {
  console.error('Socket.IO server error:', err)
})
