import http from 'http'

import {
  TOKEN_TYPES,
  WebClientToServerEvents,
  WebServerToClientEvents,
  WebSocketData,
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
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

app.get('/health', (_, res) => {
  res.json({ status: 'Websockets server running' })
})

// Worker events endpoint
app.post('/worker-events', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const result = await verifyWorkerWebsocketToken(token)
    if (result.error) {
      return res.status(401).json({ error: result.error.message })
    }

    const { event, workspaceId, data } = req.body
    if (!event || !workspaceId || !data) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const workspace = buildWorkspaceRoom({ workspaceId })
    web.to(workspace).emit(event, data)

    res.json({ success: true })
  } catch (err) {
    console.error('Error processing worker event:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
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

const PORT = process.env.WEBSOCKETS_SERVER_PORT || 4002

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`)
})

server.on('error', (err) => {
  console.error('Socket.IO server error:', err)
})
