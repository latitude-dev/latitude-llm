import { describe, expect, it, vi } from 'vitest'
import { handleStream } from './handleStream'
import { ChainEventTypes, StreamEventTypes } from '@latitude-data/constants'

const encoder = new TextEncoder()

function createMockStream(
  chunks: string[],
  options?: { delayMs?: number; onCancel?: () => void },
) {
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        if (cancelled) break

        if (options?.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs))
        }

        if (cancelled) break

        controller.enqueue(encoder.encode(chunk))
      }
      if (!cancelled) {
        controller.close()
      }
    },
    cancel() {
      cancelled = true
      options?.onCancel?.()
    },
  })

  return { stream, isCancelled: () => cancelled }
}

function createSSEChunk(event: string, data: object) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

describe('handleStream', () => {
  it('processes stream events and returns final response', async () => {
    const chunks = [
      createSSEChunk(StreamEventTypes.Latitude, {
        type: ChainEventTypes.ChainStarted,
        uuid: 'test-uuid',
        messages: [],
      }),
      createSSEChunk(StreamEventTypes.Latitude, {
        type: ChainEventTypes.ProviderCompleted,
        uuid: 'test-uuid',
        messages: [{ role: 'assistant', content: 'Hello' }],
        response: { text: 'Hello', usage: {} },
      }),
    ]

    const { stream } = createMockStream(chunks)
    const onEvent = vi.fn()

    const result = await handleStream({
      body: stream,
      onEvent,
      onToolCall: vi.fn(),
    })

    expect(result).toBeDefined()
    expect(result?.uuid).toBe('test-uuid')
    expect(onEvent).toHaveBeenCalled()
  })

  it('registers abort listener when signal is provided', async () => {
    const chunks = [
      createSSEChunk(StreamEventTypes.Latitude, {
        type: ChainEventTypes.ProviderCompleted,
        uuid: 'test-uuid',
        messages: [],
        response: { text: 'Hello', usage: {} },
      }),
    ]

    const { stream } = createMockStream(chunks)
    const abortController = new AbortController()
    const addEventListenerSpy = vi.spyOn(
      abortController.signal,
      'addEventListener',
    )

    await handleStream({
      body: stream,
      onEvent: vi.fn(),
      onToolCall: vi.fn(),
      signal: abortController.signal,
    })

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
      { once: true },
    )
  })

  it('stops processing events when abort signal is triggered', async () => {
    const eventsReceived: unknown[] = []
    const chunks = [
      createSSEChunk(StreamEventTypes.Latitude, {
        type: ChainEventTypes.ChainStarted,
        uuid: 'test-uuid',
        messages: [],
      }),
      createSSEChunk(StreamEventTypes.Latitude, {
        type: ChainEventTypes.StepStarted,
        uuid: 'test-uuid',
        messages: [],
      }),
      createSSEChunk(StreamEventTypes.Latitude, {
        type: ChainEventTypes.ProviderCompleted,
        uuid: 'test-uuid',
        messages: [],
        response: { text: 'Hello', usage: {} },
      }),
    ]

    const { stream } = createMockStream(chunks, { delayMs: 50 })
    const abortController = new AbortController()

    const promise = handleStream({
      body: stream,
      onEvent: (event) => eventsReceived.push(event),
      onToolCall: vi.fn(),
      signal: abortController.signal,
    })

    // Abort after receiving some events
    await new Promise((resolve) => setTimeout(resolve, 75))
    abortController.abort()

    // Wait for promise to settle
    await promise.catch(() => {})

    // Should have received fewer events than total (3 chunks)
    // Due to abort, we should not receive all events
    expect(eventsReceived.length).toBeLessThan(3)
  })
})
