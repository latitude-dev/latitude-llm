import type {
  PublishOptions,
  QueueConsumer,
  QueueName,
  QueuePublisherShape,
  TaskHandlers,
  TaskName,
  TaskPayload,
} from "@domain/queue"
import { QueueClientError, QueuePublishError, QueuePublisher, QueueSubscribeError, TOPIC_NAMES } from "@domain/queue"
import { Queue, Worker } from "bullmq"
import { Effect, Layer } from "effect"
import { Redis } from "ioredis"

interface BullMqJobData {
  readonly payload: unknown
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
): Effect.Effect<QueuePublisherShape, QueueClientError> =>
  Effect.gen(function* () {
    const connection = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      ...(config.redis.password ? { password: config.redis.password } : {}),
      maxRetriesPerRequest: null,
    })

    const queues = new Map<string, Queue>()

    const getQueue = (name: QueueName): Queue => {
      let queue = queues.get(name)
      if (!queue) {
        queue = new Queue(name, { connection })
        queues.set(name, queue)
      }
      return queue
    }

    return {
      publish: <T extends QueueName, K extends TaskName<T>>(
        queue: T,
        task: K,
        payload: TaskPayload<T, K>,
        options?: PublishOptions,
      ) =>
        Effect.tryPromise({
          try: async () => {
            const bullmqOptions: Record<string, unknown> = {}
            if (options?.dedupeKey) {
              bullmqOptions.jobId = options.dedupeKey
            }
            if (options?.debounceMs) {
              bullmqOptions.delay = options.debounceMs
              if (options.dedupeKey) {
                bullmqOptions.deduplication = {
                  id: options.dedupeKey,
                  ttl: options.debounceMs,
                  extend: true,
                  replace: true,
                }
              }
            }
            await getQueue(queue).add(task, { payload } satisfies BullMqJobData, bullmqOptions)
          },
          catch: (cause: unknown) => new QueuePublishError({ cause, queue }),
        }),
      close: () =>
        Effect.tryPromise({
          try: async () => {
            await Promise.allSettled(Array.from(queues.values()).map((queue) => queue.close()))
            await connection.quit()
          },
          catch: (cause: unknown) => new QueueClientError({ cause }),
        }).pipe(Effect.tapError(Effect.logError), Effect.ignore),
    }
  })

type AnyTaskHandlers = Record<string, (payload: unknown) => Effect.Effect<void, unknown>>

export const createBullMqQueueConsumer = (config: BullMqRedisConfig): Effect.Effect<QueueConsumer, QueueClientError> =>
  Effect.gen(function* () {
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      ...(config.redis.password ? { password: config.redis.password } : {}),
      maxRetriesPerRequest: null,
    }

    const workers: Map<QueueName, Worker> = new Map()
    const subscriptions = new Map<QueueName, AnyTaskHandlers>()
    let isRunning = false

    const start = () => {
      const missing = TOPIC_NAMES.filter((t) => !subscriptions.has(t))
      if (missing.length > 0) {
        return Effect.fail(
          new QueueSubscribeError({
            cause: new Error(`Missing handlers for topics: ${missing.join(", ")}`),
          }),
        )
      }

      return Effect.tryPromise({
        try: async () => {
          if (isRunning) return
          isRunning = true

          for (const [queue, handlers] of subscriptions.entries()) {
            const worker = new Worker(
              queue,
              async (job) => {
                const task = job.name ?? "default"
                const handler = handlers[task]
                if (!handler) {
                  throw new Error(`Unknown task "${task}" on topic "${queue}" — no handler registered`)
                }

                const payload = (job.data as BullMqJobData)?.payload
                if (payload === undefined) {
                  throw new Error(`Missing payload for task "${task}" on topic "${queue}"`)
                }

                await Effect.runPromise(handler(payload))
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
    }

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

    const subscribe = <T extends QueueName>(queue: T, handlers: TaskHandlers<T>): void => {
      if (isRunning) {
        throw new Error(`Cannot subscribe to queue "${queue}" after consumer has started`)
      }
      subscriptions.set(queue, handlers as unknown as AnyTaskHandlers)
    }

    return { start, stop, subscribe }
  })

export const QueuePublisherLive = (publisher: QueuePublisherShape) => Layer.succeed(QueuePublisher, publisher)
