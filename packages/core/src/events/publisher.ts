import { eventsQueue, webhooksQueue } from '../jobs/queues'
import {
  PubSubEvent,
  pubSubEvents,
  PubSubHandler,
  PubSubListener,
  pubSubProducer,
} from '../pubSub'
import { LatitudeEvent } from './events'

export const publisher = {
  publishLater: async (event: LatitudeEvent) => {
    eventsQueue.add('createEventJob', event)
    eventsQueue.add('publishEventJob', event)
    eventsQueue.add('publishToAnalyticsJob', event)

    webhooksQueue.add('processWebhookJob', event)
  },
  publish: async (eventName: PubSubEvent, args: Record<string, unknown>) => {
    pubSubProducer.publishEvent({ eventName, ...args })
  },
  subscribe: async (
    event: PubSubEvent,
    listener: PubSubHandler[typeof event],
  ) => {
    pubSubEvents.on<PubSubListener>(event, listener)
  },
  unsubscribe: async (
    event: PubSubEvent,
    listener: PubSubHandler[typeof event],
  ) => {
    pubSubEvents.removeListener(event, listener)
  },
}
