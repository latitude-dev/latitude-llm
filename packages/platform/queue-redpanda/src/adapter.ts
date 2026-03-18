import type { MessageHandler, QueueConsumer, QueueMessage, QueueName, QueuePublisher } from "@domain/queue"
import { QueueClientError, QueuePublishError, QueueSubscribeError } from "@domain/queue"
import { Effect } from "effect"
import type { EachMessagePayload, Kafka, Producer } from "kafkajs"

const QueueNameToTopic: Record<QueueName, string> = {
  "dataset-export": "dataset-export",
  "domain-events": "domain-events",
  "span-ingestion": "span-ingestion",
}

const TopicToQueueName: Record<string, QueueName> = {
  "dataset-export": "dataset-export",
  "domain-events": "domain-events",
  "span-ingestion": "span-ingestion",
}

const mapQueueMessageToKafka = (message: QueueMessage) => {
  const headers: Record<string, string> = {}
  for (const [key, value] of message.headers) {
    headers[key] = value
  }
  return {
    key: message.key ?? null,
    value: Buffer.from(message.body),
    headers,
  }
}

const mapKafkaMessageToQueue = (message: {
  value: Buffer | null
  key: Buffer | null
  headers: Record<string, Buffer | undefined> | undefined
}): QueueMessage | null => {
  if (!message.value) return null

  const headers = new Map<string, string>()
  if (message.headers) {
    for (const [key, value] of Object.entries(message.headers)) {
      if (value) {
        headers.set(key, value.toString())
      }
    }
  }

  return {
    body: new Uint8Array(message.value),
    key: message.key?.toString() ?? null,
    headers,
  }
}

export interface RedpandaQueuePublisherConfig {
  readonly kafka: Kafka
}

export const createRedpandaQueuePublisher = (
  config: RedpandaQueuePublisherConfig,
): Effect.Effect<QueuePublisher, QueueClientError> =>
  Effect.gen(function* () {
    const producer: Producer = yield* Effect.tryPromise({
      try: () => {
        const p = config.kafka.producer({
          allowAutoTopicCreation: false,
          retry: {
            initialRetryTime: 100,
            maxRetryTime: 30000,
          },
        })
        return p.connect().then(() => p)
      },
      catch: (cause: unknown) => new QueueClientError({ cause }),
    })

    return {
      publish: (queue: QueueName, message: QueueMessage) =>
        Effect.tryPromise({
          try: () =>
            producer.send({
              topic: QueueNameToTopic[queue],
              acks: -1,
              messages: [mapQueueMessageToKafka(message)],
            }),
          catch: (cause: unknown) => new QueuePublishError({ cause, queue }),
        }),
    }
  })

export interface RedpandaQueueConsumerConfig {
  readonly groupId: string
  readonly kafka: Kafka
}

export const createRedpandaQueueConsumer = (
  config: RedpandaQueueConsumerConfig,
): Effect.Effect<QueueConsumer, QueueClientError> =>
  Effect.gen(function* () {
    const consumer = config.kafka.consumer({ groupId: config.groupId })
    const subscriptions = new Map<QueueName, MessageHandler>()
    let isRunning = false
    let runPromise: Promise<void> | undefined

    const start = () =>
      Effect.tryPromise({
        try: async () => {
          await consumer.connect()
          for (const queue of subscriptions.keys()) {
            await consumer.subscribe({ topic: QueueNameToTopic[queue] })
          }

          isRunning = true

          runPromise = consumer.run({
            eachMessage: async (payload: EachMessagePayload) => {
              if (!isRunning) return

              const { message, topic } = payload
              const queueMessage = mapKafkaMessageToQueue({
                value: message.value,
                key: message.key,
                headers: message.headers as Record<string, Buffer | undefined>,
              })
              if (!queueMessage) return

              const queue = TopicToQueueName[topic]
              const handler = subscriptions.get(queue)
              if (!handler) return

              await Effect.runPromise(handler.handle(queueMessage))
            },
          })

          runPromise.catch((error) => {
            void Effect.runPromise(Effect.logError(`Redpanda consumer crashed: ${error}`))
          })
        },
        catch: (cause: unknown) => new QueueSubscribeError({ cause }),
      })

    const stop = () =>
      Effect.gen(function* () {
        isRunning = false
        yield* Effect.tryPromise({
          try: () => consumer.disconnect(),
          catch: () => undefined as never,
        })
        const promise = runPromise
        if (promise) {
          yield* Effect.tryPromise({
            try: () => promise,
            catch: () => undefined as never,
          })
        }
      })

    const subscribe = (queue: QueueName, handler: MessageHandler): void => {
      subscriptions.set(queue, handler)
    }

    return { start, stop, subscribe }
  })
