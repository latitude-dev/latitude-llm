import { Context } from 'hono'
import { HttpBindings } from '@hono/node-server'

/**
 * Creates an AbortSignal that triggers when the client disconnects.
 *
 * Uses the Node.js socket 'close' event to detect when the TCP connection is terminated.
 * This works reliably for both HTTP and HTTPS connections (including behind AWS load balancers
 * that terminate TLS and proxy via HTTP/1.1).
 *
 * @example
 * ```typescript
 * const abortSignal = createRequestAbortSignal(c)
 *
 * const result = await someService({
 *   data: requestData,
 *   abortSignal,
 * })
 * ```
 */
export function createRequestAbortSignal(c: Context): AbortSignal {
  const abortController = new AbortController()

  const bindings = c.env as HttpBindings | undefined
  const socket = bindings?.incoming?.socket

  // In test environments (app.request()), HttpBindings won't be available.
  // In production with @hono/node-server, the socket is always present.
  if (!socket) return abortController.signal

  socket.once('close', () => {
    abortController.abort()
  })

  return abortController.signal
}
