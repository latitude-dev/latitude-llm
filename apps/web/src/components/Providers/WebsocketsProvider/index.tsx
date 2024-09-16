'use client'

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
} from 'react'

import {
  WebClientToServerEvents,
  WebServerToClientEvents,
} from '@latitude-data/core/browser'
import { useSession, useToast } from '@latitude-data/web-ui'
import { refreshWebesocketTokenAction } from '$/actions/user/refreshWebsocketTokenAction'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { IoProvider, useSocket } from 'socket.io-react-hook'

export const SocketIOProvider = ({ children }: { children: ReactNode }) => {
  return <IoProvider>{children}</IoProvider>
}

function useJoinWorkspace({ connection }: { connection: IWebsocketConfig }) {
  const { currentUser } = useSession()
  const { data: workspace } = useCurrentWorkspace()
  return useCallback(() => {
    connection.socket.emit('joinWorkspace', {
      workspaceId: workspace.id,
      userId: currentUser.id,
    })
  }, [workspace.id, connection.socket, connection.connected])
}

export function useSocketConnection({
  socketServer,
}: {
  socketServer: string
}) {
  const { toast } = useToast()
  const connection = useSocket<
    WebServerToClientEvents,
    WebClientToServerEvents
  >(
    `${socketServer}/web`, // namespace
    {
      // FIXME: Remove this line when infra is ready
      autoConnect: false,
      path: '/websocket', // Socket server endpoint
      withCredentials: true, // Cookies cross-origin
      transports: ['websocket'],
    },
  )

  connection.socket.on('connect_error', async (error) => {
    if (error.message.startsWith('AUTH_ERROR')) {
      const [data] = await refreshWebesocketTokenAction()

      if (data && data.success) {
        connection.socket.connect()
      } else {
        toast({
          title: 'We have a problem reconnecting to the server',
          description: 'Try logout and login again',
          variant: 'destructive',
        })
      }
    }
  })

  return connection
}

type IWebsocketConfig = ReturnType<typeof useSocketConnection>
const WebsocketConfigContext = createContext<IWebsocketConfig>(
  {} as IWebsocketConfig,
)

export const LatitudeWebsocketsProvider = ({
  children,
  socketServer,
}: {
  children: ReactNode
  socketServer: string
}) => {
  const connection = useSocketConnection({ socketServer })
  const joinWorkspace = useJoinWorkspace({ connection })
  useEffect(() => {
    if (connection.connected) return

    joinWorkspace()
  }, [connection.connected, joinWorkspace])
  return (
    <WebsocketConfigContext.Provider value={connection}>
      {children}
    </WebsocketConfigContext.Provider>
  )
}

export const useWebsocketConfig = () => {
  const context = useContext(WebsocketConfigContext)

  if (!context) {
    throw new Error(
      'useWebsocketConfig must be used within a WebsocketProvider',
    )
  }

  return context
}
