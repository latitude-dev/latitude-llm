import type { MessageHandler, QueueConsumer, QueueMessage, QueueName, QueuePublisher } from "@domain/queue"
import { QueueClientError, QueuePublishError, QueueSubscribeError } from "@domain/queue"
import { base64Decode, base64Encode } from "@repo/utils"
import { Queue, Worker } from "bullmq"
import { Effect } from "effect"
import { Redis } from "ioredis"

export interface BullMqJobData {
  readonly body: string
  readonly headers: Record<string, string>
}

export const mapQueueMessageToJob = (message: QueueMessage) => {
  const headers: Record<string, string> = {}
  for (const [key, value] of message.headers) {
    headers[key] = value
  }
  return {
    name: "default",
    data: { body: base64Encode(message.body), headers } satisfies BullMqJobData,
  }
}

export const mapJobToQueueMessage = (job: { id: string; data: BullMqJobData }): QueueMessage | null => {
  if (!job.data?.body) return null

  const headers = new Map<string, string>()
  if (job.data.headers) {
    for (const [key, value] of Object.entries(job.data.headers)) {
      headers.set(key, value)
    }
  }

  return {
    body: base64Decode(job.data.body),
    key: job.id,
    headers,
  }
}

export interface BullMqRedisConfig {
  readonly redis: {
    readonly host: string
    readonly port: number
    readonly password?: string
  }
}

export const createBullMqQueuePublisher = (
  config: BullMqRedisConfig,
): Effect.Effect<QueuePublisher, QueueClientError> =>
  Effect.gen(function* () {
    const connection = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      ...(config.redis.password ? { password: config.redis.password } : {}),
      maxRetriesPerRequest: null,
    })

    const queues: Record<QueueName, Queue> = {
      "dataset-export": new Queue("dataset-export", { connection }),
      "domain-events": new Queue("domain-events", { connection }),
      "span-ingestion": new Queue("span-ingestion", { connection }),
    }

    return {
      publish: (queue: QueueName, message: QueueMessage) =>
        Effect.tryPromise({
          try: async () => {
            const jobData = mapQueueMessageToJob(message)
            await queues[queue].add(jobData.name, jobData.data)
          },
          catch: (cause: unknown) => new QueuePublishError({ cause, queue }),
        }),
      close: () =>
        Effect.tryPromise({
          try: async () => {
            await Promise.allSettled(Object.values(queues).map((queue) => queue.close()))
            await connection.quit()
          },
          catch: (cause: unknown) => new QueueClientError({ cause }),
        }).pipe(Effect.tapError(Effect.logError), Effect.ignore),
    }
  })

export const createBullMqQueueConsumer = (config: BullMqRedisConfig): Effect.Effect<QueueConsumer, QueueClientError> =>
  Effect.gen(function* () {
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      ...(config.redis.password ? { password: config.redis.password } : {}),
      maxRetriesPerRequest: null,
    }

    const workers: Map<QueueName, Worker> = new Map()
    const subscriptions = new Map<QueueName, MessageHandler>()
    let isRunning = false

    const start = () =>
      Effect.tryPromise({
        try: async () => {
          if (isRunning) return
          isRunning = true

          for (const [queue, handler] of subscriptions.entries()) {
            const worker = new Worker(
              queue,
              async (job) => {
                const queueMessage = mapJobToQueueMessage({
                  id: job.id ?? "",
                  data: job.data as BullMqJobData,
                })
                if (!queueMessage) return

                await Effect.runPromise(handler.handle(queueMessage))
              },
              {
                connection: new Redis(redisConfig),
                concurrency: 10,
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 1000 },
                autorun: false,
              },
            )

            worker.on("error", (error) => {
              void Effect.runPromise(Effect.logError(`BullMQ worker error on queue ${queue}: ${error}`))
            })

            workers.set(queue, worker)
          }

          for (const worker of workers.values()) {
            worker.run()
          }
        },
        catch: (cause: unknown) => new QueueSubscribeError({ cause }),
      })

    const stop = () =>
      Effect.gen(function* () {
        if (!isRunning) return

        yield* Effect.tryPromise({
          try: async () => {
            await Promise.allSettled(Array.from(workers.values()).map((worker) => worker.close()))
          },
          catch: (cause: unknown) => new QueueClientError({ cause }),
        }).pipe(Effect.tapError(Effect.logError), Effect.ignore)

        isRunning = false
      })

    const subscribe = (queue: QueueName, handler: MessageHandler): void => {
      if (isRunning) {
        throw new Error(`Cannot subscribe to queue "${queue}" after consumer has started`)
      }
      subscriptions.set(queue, handler)
    }

    return { start, stop, subscribe }
  })
