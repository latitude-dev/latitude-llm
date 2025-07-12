import { env } from '@latitude-data/env'
import { QueueEvents, QueueEventsListener, QueueEventsProducer } from 'bullmq'

const options = {
  connection: {
    host: env.QUEUE_HOST,
    port: env.QUEUE_PORT,
    password: env.QUEUE_PASSWORD,
  },
}

const queueName = 'pubsub'
export const pubSubProducer = new QueueEventsProducer(queueName, options)
export const pubSubEvents = new QueueEvents(queueName, options)

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
