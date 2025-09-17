import { env } from '@latitude-data/env'
import { QueueEvents, QueueEventsListener, QueueEventsProducer } from 'bullmq'
import { buildRedisConnection } from '../redis'

const queueName = 'pubsub'

let _pubSub:
  | {
      producer: QueueEventsProducer
      events: QueueEvents
    }
  | undefined

export async function pubSub() {
  if (_pubSub) return _pubSub

  const options = {
    prefixKey: 'latitude',
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
      maxRetriesPerRequest: 0,
    }),
  }

  const pubSubProducer = new QueueEventsProducer(queueName, options)
  const pubSubEvents = new QueueEvents(queueName, options)

  _pubSub = {
    producer: pubSubProducer,
    events: pubSubEvents,
  }

  return _pubSub
}

// PubSub events
export type PubSubEvent = 'clientToolResultReceived'

// PubSub handlers
export interface PubSubHandler {
  clientToolResultReceived: (args: {
    toolCallId: string
    result: unknown
    isError?: string
  }) => void
}

// PubSub listeners
export interface PubSubListener extends QueueEventsListener {
  clientToolResultReceived: PubSubHandler['clientToolResultReceived']
}
