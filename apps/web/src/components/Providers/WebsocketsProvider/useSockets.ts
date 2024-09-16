import { WebServerToClientEvents } from '@latitude-data/core/browser'
import { useSocketEvent } from 'socket.io-react-hook'

import { useWebsocketConfig } from './index'

type ServerEventType = keyof WebServerToClientEvents
export type EventArgs<T extends ServerEventType> = Parameters<
  WebServerToClientEvents[T]
>[0]
export function useSockets<SEName extends ServerEventType>({
  event,
  onMessage,
}: {
  event: SEName
  onMessage: (args: EventArgs<SEName>) => void
}) {
  const connection = useWebsocketConfig()
  useSocketEvent<EventArgs<SEName>>(connection.socket, event, {
    onMessage,
  })
  return connection.socket
}
