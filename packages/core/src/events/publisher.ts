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
    const { events } = await pubSub()
    events.on<PubSubListener>(event, listener)
  },
  unsubscribe: async (
    event: PubSubEvent,
    listener: PubSubHandler[typeof event],
  ) => {
    const { events } = await pubSub()
    events.removeListener(event, listener)
  },
}
