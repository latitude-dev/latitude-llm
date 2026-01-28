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
  const { incoming } = c.env as HttpBindings // Should be always available in Hono Node.js environment

  incoming.socket.once('close', () => {
    abortController.abort()
  })

  return abortController.signal
}
