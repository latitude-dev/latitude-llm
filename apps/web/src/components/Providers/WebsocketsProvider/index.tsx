'use client'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
} from 'react'

import { refreshWebesocketTokenAction } from '$/actions/user/refreshWebsocketTokenAction'
import {
  WebClientToServerEvents,
  WebServerToClientEvents,
  Workspace,
} from '@latitude-data/core/browser'
import { IoProvider, useSocket } from '@latitude-data/socket.io-react-hook'
import { useSession } from '@latitude-data/web-ui/providers'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { captureClientError } from '$/instrumentation-client'

export const SocketIOProvider = ({ children }: { children: ReactNode }) => {
  return <IoProvider>{children}</IoProvider>
}

function useJoinWorkspace({ connection }: { connection: IWebsocketConfig }) {
  const { currentUser } = useSession()

  return useCallback(
    (workspace: Workspace) => {
      connection.socket.emit('joinWorkspace', {
        workspaceId: workspace.id,
        userId: currentUser.id,
      })
    },
    [connection.socket, currentUser.id],
  )
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
      path: '/websocket', // Socket server endpoint
      withCredentials: true, // Cookies cross-origin
      transports: ['websocket'],
    },
  )

  connection.socket.on('connect_error', async (error) => {
    if (error.message.startsWith('AUTH_ERROR')) {
      try {
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
      } catch (e) {
        captureClientError(e as Error, {
          component: 'WebsocketsProvider',
          context: 'connect_error',
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
  workspace,
  children,
  socketServer,
}: {
  workspace: Workspace
  children: ReactNode
  socketServer: string
}) => {
  const connection = useSocketConnection({ socketServer })
  const joinWorkspace = useJoinWorkspace({ connection })
  useEffect(() => {
    if (connection.connected) return

    joinWorkspace(workspace)
  }, [connection.connected, joinWorkspace, workspace])
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
