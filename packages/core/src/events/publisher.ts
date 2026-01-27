import { LatitudeEvent } from './events'
import { queues } from '../jobs/queues'
import {
  pubSub,
  type PubSubListener,
  type PubSubEvent,
  type PubSubHandler,
} from '../pubSub'

export const publisher = {
  publishLater: async (event: LatitudeEvent) => {
    const { eventsQueue, webhooksQueue } = await queues()

    eventsQueue.add('publishEventJob', event)
    eventsQueue.add('publishToAnalyticsJob', event)

    webhooksQueue.add('processWebhookJob', event)
  },
  publish: async (eventName: PubSubEvent, args: Record<string, unknown>) => {
    const { producer } = await pubSub()
    producer.publishEvent({ eventName, ...args })
  },
  subscribe: async (
    event: PubSubEvent,
    listener: PubSubHandler[typeof event],
  ) => {
    await addEventListener(event, listener)
  },
  unsubscribe: async (
    event: PubSubEvent,
    listener: PubSubHandler[typeof event],
  ) => {
    await removeEventListener(event, listener)
  },
}

type PubSubListenerFn = (args: unknown) => void

const listenersByEvent = new Map<PubSubEvent, Set<PubSubListenerFn>>()
const listenerAttached = new Map<PubSubEvent, boolean>()
const listenerPromises = new Map<PubSubEvent, Promise<void>>()
const dispatchers = new Map<PubSubEvent, PubSubListenerFn>()

function getListeners(event: PubSubEvent) {
  const existing = listenersByEvent.get(event)
  if (existing) return existing

  const created = new Set<PubSubListenerFn>()
  listenersByEvent.set(event, created)
  return created
}

function getExistingListeners(event: PubSubEvent) {
  return listenersByEvent.get(event)
}

function getDispatcher(event: PubSubEvent) {
  const existing = dispatchers.get(event)
  if (existing) return existing

  const dispatcher: PubSubListenerFn = (args) => {
    const listeners = getListeners(event)
    for (const listener of listeners) {
      listener(args)
    }
  }

  dispatchers.set(event, dispatcher)
  return dispatcher
}

async function addEventListener<Event extends PubSubEvent>(
  event: Event,
  listener: PubSubHandler[Event],
) {
  const listeners = getListeners(event)
  listeners.add(listener as PubSubListenerFn)
  await ensureEventListener(event)
}

async function removeEventListener<Event extends PubSubEvent>(
  event: Event,
  listener: PubSubHandler[Event],
) {
  const listeners = getExistingListeners(event)
  if (!listeners) return

  listeners.delete(listener as PubSubListenerFn)
  if (listeners.size === 0) {
    await detachEventListener(event)
  }
}

async function ensureEventListener<Event extends PubSubEvent>(event: Event) {
  if (listenerAttached.get(event)) return
  if (!listenerPromises.get(event)) {
    listenerPromises.set(
      event,
      (async () => {
        const { events } = await pubSub()
        const dispatcher = getDispatcher(event)
        events.on<PubSubListener>(event, dispatcher as PubSubListener[Event])
        listenerAttached.set(event, true)
      })(),
    )
  }

  await listenerPromises.get(event)
}

async function detachEventListener<Event extends PubSubEvent>(event: Event) {
  if (!listenerAttached.get(event)) return
  const { events } = await pubSub()
  const dispatcher = getDispatcher(event)
  events.removeListener(event, dispatcher as PubSubListener[Event])
  listenerAttached.set(event, false)
  listenerPromises.delete(event)
}
