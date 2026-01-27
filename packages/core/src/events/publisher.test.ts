import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { publisher } from './publisher'
import { pubSub } from '../pubSub'

vi.mock('../pubSub', () => {
  const mockEvents = {
    on: vi.fn(),
    removeListener: vi.fn(),
  }
  const mockProducer = {
    publishEvent: vi.fn(),
  }
  return {
    pubSub: vi.fn().mockResolvedValue({
      events: mockEvents,
      producer: mockProducer,
    }),
  }
})

vi.mock('../jobs/queues', () => ({
  queues: vi.fn().mockResolvedValue({
    eventsQueue: {
      add: vi.fn(),
    },
    webhooksQueue: {
      add: vi.fn(),
    },
  }),
}))

describe('publisher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Clean up all listeners after each test
    vi.clearAllMocks()
  })

  describe('subscribe/unsubscribe', () => {
    it('should attach a single QueueEvents listener for multiple subscribers', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const handler3 = vi.fn()

      await publisher.subscribe('cancelJob', handler1)
      await publisher.subscribe('cancelJob', handler2)
      await publisher.subscribe('cancelJob', handler3)

      const { events } = await pubSub()

      // Should only attach the listener once, not three times
      expect(events.on).toHaveBeenCalledTimes(1)
      expect(events.on).toHaveBeenCalledWith('cancelJob', expect.any(Function))
    })

    it('should dispatch events to all registered listeners', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      await publisher.subscribe('cancelJob', handler1)
      await publisher.subscribe('cancelJob', handler2)

      const { events } = await pubSub()
      const dispatcherFn = (events.on as ReturnType<typeof vi.fn>).mock
        .calls[0][1]

      // Simulate an event being fired
      const eventData = { jobId: '123' }
      dispatcherFn(eventData)

      expect(handler1).toHaveBeenCalledWith(eventData)
      expect(handler2).toHaveBeenCalledWith(eventData)
    })

    it('should remove listener when last subscriber unsubscribes', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      await publisher.subscribe('cancelJob', handler1)
      await publisher.subscribe('cancelJob', handler2)

      const { events } = await pubSub()

      // Should have attached listener
      expect(events.on).toHaveBeenCalledTimes(1)

      // Unsubscribe first handler - should NOT detach yet
      await publisher.unsubscribe('cancelJob', handler1)
      expect(events.removeListener).not.toHaveBeenCalled()

      // Unsubscribe second handler - should NOW detach
      await publisher.unsubscribe('cancelJob', handler2)
      expect(events.removeListener).toHaveBeenCalledTimes(1)
      expect(events.removeListener).toHaveBeenCalledWith(
        'cancelJob',
        expect.any(Function),
      )
    })

    it('should handle concurrent subscribe/unsubscribe without listener leaks', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const handler3 = vi.fn()

      // Rapidly subscribe and unsubscribe in parallel
      await Promise.all([
        publisher.subscribe('cancelJob', handler1),
        publisher.subscribe('cancelJob', handler2),
        publisher.unsubscribe('cancelJob', handler1),
        publisher.subscribe('cancelJob', handler3),
        publisher.unsubscribe('cancelJob', handler2),
      ])

      const { events } = await pubSub()

      // Should have attached listener exactly once
      expect(events.on).toHaveBeenCalledTimes(1)

      // Should NOT have detached since handler3 is still subscribed
      expect(events.removeListener).not.toHaveBeenCalled()

      // Now unsubscribe the last handler
      await publisher.unsubscribe('cancelJob', handler3)

      // Now should have detached
      expect(events.removeListener).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple concurrent subscribes without race conditions', async () => {
      const handlers = Array.from({ length: 10 }, () => vi.fn())

      // Subscribe all handlers concurrently
      await Promise.all(
        handlers.map((handler) => publisher.subscribe('cancelJob', handler)),
      )

      const { events } = await pubSub()

      // Should only attach listener once despite 10 concurrent subscribes
      expect(events.on).toHaveBeenCalledTimes(1)

      // Get the dispatcher function
      const dispatcherFn = (events.on as ReturnType<typeof vi.fn>).mock
        .calls[0][1]

      // Dispatch an event
      const eventData = { jobId: 'test' }
      dispatcherFn(eventData)

      // All 10 handlers should have been called
      handlers.forEach((handler) => {
        expect(handler).toHaveBeenCalledWith(eventData)
      })
    })

    it('should handle unsubscribe before subscribe completes', async () => {
      const handler = vi.fn()

      // Start subscribe and immediately unsubscribe
      const subscribePromise = publisher.subscribe('cancelJob', handler)
      const unsubscribePromise = publisher.unsubscribe('cancelJob', handler)

      await Promise.all([subscribePromise, unsubscribePromise])

      const { events } = await pubSub()

      // Listener should have been attached
      expect(events.on).toHaveBeenCalledTimes(1)

      // And then immediately detached since no listeners remain
      expect(events.removeListener).toHaveBeenCalledTimes(1)
    })

    it('should isolate listeners between different event types', async () => {
      const cancelHandler = vi.fn()
      const toolHandler = vi.fn()

      await publisher.subscribe('cancelJob', cancelHandler)
      await publisher.subscribe('clientToolResultReceived', toolHandler)

      const { events } = await pubSub()

      // Should attach listeners for both event types
      expect(events.on).toHaveBeenCalledTimes(2)
      expect(events.on).toHaveBeenCalledWith('cancelJob', expect.any(Function))
      expect(events.on).toHaveBeenCalledWith(
        'clientToolResultReceived',
        expect.any(Function),
      )

      // Get both dispatcher functions
      const cancelDispatcher = (events.on as ReturnType<typeof vi.fn>).mock
        .calls[0][1]
      const toolDispatcher = (events.on as ReturnType<typeof vi.fn>).mock
        .calls[1][1]

      // Dispatch to cancel job
      cancelDispatcher({ jobId: 'test' })
      expect(cancelHandler).toHaveBeenCalledTimes(1)
      expect(toolHandler).not.toHaveBeenCalled()

      // Dispatch to tool result
      toolDispatcher({ result: 'data' })
      expect(cancelHandler).toHaveBeenCalledTimes(1)
      expect(toolHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe('publish', () => {
    it('should publish events to producer', async () => {
      const eventData = { key: 'value' }

      await publisher.publish('cancelJob', eventData)

      const { producer } = await pubSub()
      expect(producer.publishEvent).toHaveBeenCalledWith({
        eventName: 'cancelJob',
        ...eventData,
      })
    })
  })
})
