import type {
  PublishOptions,
  QueueConsumer,
  QueueName,
  QueuePublisherShape,
  SubscribeOptions,
  TaskHandlers,
  TaskName,
  TaskPayload,
} from "@domain/queue"
import { QueueClientError, QueuePublishError, QueuePublisher, QueueSubscribeError, TOPIC_NAMES } from "@domain/queue"
import { SpanStatusCode, trace } from "@opentelemetry/api"
import { recordSpanExceptionForDatadog, serializeError } from "@repo/observability"
import { Queue, Worker } from "bullmq"
import { Cause, Effect, Layer } from "effect"
import { Redis } from "ioredis"

import { type BullMqWorkerIncident, failedJobContextFromJob } from "./worker-incidents.ts"

const tracer = trace.getTracer("bullmq")

const toError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)))

const incidentToLogFields = (incident: BullMqWorkerIncident) => {
  if (incident.kind === "worker_error") {
    return {
      kind: incident.kind,
      queue: incident.queue,
      error: serializeError(incident.error),
    }
  }
  if (incident.kind === "job_failed") {
    return {
      kind: incident.kind,
      queue: incident.queue,
      job: incident.job,
      error: serializeError(incident.error),
    }
  }
  return { kind: incident.kind, queue: incident.queue, jobId: incident.jobId }
}

interface BullMqJobData {
  readonly payload: unknown
}

export type { BullMqFailedJobContext, BullMqWorkerIncident } from "./worker-incidents.ts"

export interface BullMqRedisConfig {
  readonly redis: {
    readonly host: string
    readonly port: number
    readonly password?: string
    readonly tls?: boolean
  }
  /** Optional sink for worker incidents (errors, failed jobs, stalls) for alerting and dashboards. */
  readonly onWorkerIncident?: (incident: BullMqWorkerIncident) => void
}

const buildRedisOptions = (redis: BullMqRedisConfig["redis"]) => ({
  host: redis.host,
  port: redis.port,
  ...(redis.password ? { password: redis.password } : {}),
  ...(redis.tls ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
})

export const createBullMqQueuePublisher = (
  config: BullMqRedisConfig,
): Effect.Effect<QueuePublisherShape, QueueClientError> =>
  Effect.gen(function* () {
    const connection = new Redis(buildRedisOptions(config.redis))

    const queues = new Map<string, Queue>()

    const getQueue = (name: QueueName): Queue => {
      let queue = queues.get(name)
      if (!queue) {
        queue = new Queue(name, { connection, prefix: '{bull}' })
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
    const redisConfig = buildRedisOptions(config.redis)

    const DEFAULT_CONCURRENCY = 10
    const services = yield* Effect.services<never>()
    const workers: Map<QueueName, Worker> = new Map()
    const subscriptions = new Map<QueueName, AnyTaskHandlers>()
    const concurrencyOverrides = new Map<QueueName, number>()
    let isRunning = false
    const emitIncident = config.onWorkerIncident

    const logIncident = (incident: BullMqWorkerIncident) => {
      emitIncident?.(incident)
      void Effect.runPromiseExitWith(services)(
        Effect.logError("BullMQ worker incident", incidentToLogFields(incident)),
      ).then((exit) => {
        if (exit._tag === "Failure") {
          console.error("Effect.logError failed after BullMQ incident", Cause.squash(exit.cause))
        }
      })
    }

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
                const task = job.name
                const handler = handlers[task]
                if (!handler) {
                  throw new Error(`Unknown task "${task}" on topic "${queue}" — no handler registered`)
                }

                const payload = (job.data as BullMqJobData)?.payload
                if (payload === undefined) {
                  throw new Error(`Missing payload for task "${task}" on topic "${queue}"`)
                }

                // Wrap handler execution with OTel instrumentation
                await tracer.startActiveSpan(
                  `bullmq.${queue}.${task}`,
                  {
                    attributes: {
                      "messaging.system": "bullmq",
                      "messaging.destination": queue,
                      "messaging.operation": "process",
                      "messaging.message_id": job.id,
                      "messaging.bullmq.task": task,
                      "messaging.bullmq.attempts_made": job.attemptsMade,
                    },
                  },
                  async (span) => {
                    try {
                      await Effect.runPromiseWith(services)(handler(payload))
                      span.setStatus({ code: SpanStatusCode.OK })
                    } catch (error) {
                      const err = recordSpanExceptionForDatadog(span, error)
                      span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: err.message,
                      })
                      throw err
                    } finally {
                      span.end()
                    }
                  },
                )
              },
              {
                connection: new Redis(redisConfig),
                prefix: '{bull}',
                concurrency: concurrencyOverrides.get(queue) ?? DEFAULT_CONCURRENCY,
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 1000 },
                autorun: false,
              },
            )

            worker.on("error", (error) => {
              logIncident({ kind: "worker_error", queue, error: toError(error) })
            })

            worker.on("failed", (job, error) => {
              logIncident({
                kind: "job_failed",
                queue,
                job: failedJobContextFromJob(job),
                error: toError(error),
              })
            })

            worker.on("stalled", (jobId) => {
              logIncident({ kind: "job_stalled", queue, jobId })
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

    const subscribe = <T extends QueueName>(queue: T, handlers: TaskHandlers<T>, options?: SubscribeOptions): void => {
      if (isRunning) {
        throw new Error(`Cannot subscribe to queue "${queue}" after consumer has started`)
      }
      subscriptions.set(queue, handlers as unknown as AnyTaskHandlers)
      if (options?.concurrency) {
        concurrencyOverrides.set(queue, options.concurrency)
      }
    }

    return { start, stop, subscribe }
  })

export const QueuePublisherLive = (publisher: QueuePublisherShape) => Layer.succeed(QueuePublisher, publisher)
