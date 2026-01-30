import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Context } from 'hono'
import { EventEmitter } from 'events'
import { createRequestAbortSignal } from './createRequestAbortSignal'

function createMockSocket() {
  const emitter = new EventEmitter()
  return {
    once: vi.fn((event: string, callback: () => void) => {
      emitter.once(event, callback)
    }),
    emit: (event: string) => emitter.emit(event),
  }
}

function createMockContext(
  socket?: ReturnType<typeof createMockSocket>,
): Context {
  const env = socket
    ? {
        incoming: { socket },
      }
    : undefined

  return {
    env,
  } as unknown as Context
}

describe('createRequestAbortSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an AbortSignal', () => {
    const context = createMockContext()
    const signal = createRequestAbortSignal(context)

    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('returns non-aborted signal initially', () => {
    const socket = createMockSocket()
    const context = createMockContext(socket)
    const signal = createRequestAbortSignal(context)

    expect(signal.aborted).toBe(false)
  })

  it('registers a listener on socket close event', () => {
    const socket = createMockSocket()
    const context = createMockContext(socket)

    createRequestAbortSignal(context)

    expect(socket.once).toHaveBeenCalledWith('close', expect.any(Function))
  })

  it('aborts the signal when socket closes', () => {
    const socket = createMockSocket()
    const context = createMockContext(socket)
    const signal = createRequestAbortSignal(context)

    expect(signal.aborted).toBe(false)

    socket.emit('close')

    expect(signal.aborted).toBe(true)
  })

  it('triggers abort event listeners when socket closes', () => {
    const socket = createMockSocket()
    const context = createMockContext(socket)
    const signal = createRequestAbortSignal(context)
    const abortHandler = vi.fn()

    signal.addEventListener('abort', abortHandler)

    socket.emit('close')

    expect(abortHandler).toHaveBeenCalledTimes(1)
  })

  it('handles missing HttpBindings gracefully (test environment)', () => {
    const context = createMockContext()
    const signal = createRequestAbortSignal(context)

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('handles undefined env gracefully', () => {
    const context = { env: undefined } as unknown as Context
    const signal = createRequestAbortSignal(context)

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('handles missing socket gracefully', () => {
    const context = {
      env: { incoming: {} },
    } as unknown as Context
    const signal = createRequestAbortSignal(context)

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })
})
