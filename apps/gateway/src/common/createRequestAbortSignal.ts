import { Context } from 'hono'
import { HttpBindings } from '@hono/node-server'
import type { Socket } from 'net'

const socketAbortMap = new WeakMap<Socket, AbortSignal>()

/**
 * Creates an AbortSignal that triggers when the client disconnects.
 *
 * Uses a WeakMap to ensure only one 'close' listener is registered per socket,
 * preventing listener accumulation on keep-alive connections under high throughput.
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
  const bindings = c.env as HttpBindings | undefined
  const socket = bindings?.incoming?.socket

  if (!socket) return new AbortController().signal

  let signal = socketAbortMap.get(socket)
  if (!signal) {
    const controller = new AbortController()
    socket.once('close', () => controller.abort())
    signal = controller.signal
    socketAbortMap.set(socket, signal)
  }

  return signal
}
