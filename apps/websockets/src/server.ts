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
import { instrument } from '@socket.io/admin-ui'

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
    origin: [env.APP_URL, 'https://admin.socket.io'],
    credentials: true,
    methods: ['GET', 'POST'],
  },
})

instrument(io, {
  auth: {
    type: 'basic',
    username: env.WEBSOCKETS_ADMIN_USERNAME,
    password: env.WEBSOCKETS_ADMIN_PASSWORD,
  },
  readonly: true,
})

io.of('/admin').use((_socket, next) => next())

io.on('connection', (socket: Socket) => {
  // Main namespace is not enabled. Connect to /web or /workers instead.
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
  socket.on('evaluationStatus', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('evaluationStatus', data)
  })

  socket.on('evaluationResultCreated', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })

    web.to(workspace).emit('evaluationResultCreated', data)
  })

  socket.on('documentLogCreated', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('documentLogCreated', data)
  })

  socket.on('documentSuggestionCreated', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('documentSuggestionCreated', data)
  })

  socket.on('evaluationResultV2Created', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('evaluationResultV2Created', data)
  })

  socket.on('datasetRowsCreated', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('datasetRowsCreated', data)
  })

  socket.on('mcpServerScaleEvent', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('mcpServerScaleEvent', data)
  })

  socket.on('mcpServerConnected', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('mcpServerConnected', data)
  })

  socket.on('experimentStatus', (args) => {
    const { workspaceId, data } = args
    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit('experimentStatus', data)
  })
})

const PORT = process.env.WEBSOCKETS_SERVER_PORT || 4002

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`)
})

server.on('error', (err) => {
  console.error('Socket.IO server error:', err)
})
