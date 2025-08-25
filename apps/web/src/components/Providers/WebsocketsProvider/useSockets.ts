import type { WebServerToClientEvents } from '@latitude-data/core/browser'
import { useSocketEvent } from '@latitude-data/socket.io-react-hook'

import { useWebsocketConfig } from './index'

type ServerEventType = keyof WebServerToClientEvents
export type EventArgs<T extends ServerEventType> = Parameters<WebServerToClientEvents[T]>[0]
export function useSockets<SEName extends ServerEventType>({
  event,
  onMessage,
}: {
  event: SEName
  onMessage: (args: EventArgs<SEName>) => void
}) {
  const connection = useWebsocketConfig()

  try {
    // biome-ignore lint: false positive, it thinks we are calling this hook conditionally because of the wrapping try/catch
    useSocketEvent<EventArgs<SEName>>(connection.socket, event, {
      onMessage,
    })
  } catch (_) {
    // do nothing, sometimes the socket is not ready yet and the event is not
    // registered
  }

  return connection.socket
}
