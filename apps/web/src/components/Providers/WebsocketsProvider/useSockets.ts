import { useSocketEvent } from '@latitude-data/socket.io-react-hook'

import { useWebsocketConfig } from './index'
import { WebServerToClientEvents } from '@latitude-data/core/websockets/constants'

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

  try {
    useSocketEvent<EventArgs<SEName>>(connection.socket, event, {
      onMessage,
    })
  } catch (_) {
    // do nothing, sometimes the socket is not ready yet and the event is not
    // registered
  }

  return connection.socket
}
