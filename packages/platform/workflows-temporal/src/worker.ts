import { SpanStatusCode, trace } from "@opentelemetry/api"
import { createLogger } from "@repo/observability"
import { Context as ActivityContext } from "@temporalio/activity"
import type {
  ActivityExecuteInput,
  ActivityInterceptorsFactory,
  Next,
} from "@temporalio/worker"
import { NativeConnection, Worker } from "@temporalio/worker"
import type { TemporalConfig } from "./config.ts"

const tracer = trace.getTracer("temporal-worker")
const toError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)))

const datadogActivityInterceptor: ActivityInterceptorsFactory = (_ctx: ActivityContext) => ({
  inbound: {
    async execute(input: ActivityExecuteInput, next: Next): Promise<unknown> {
      const info = ActivityContext.current().info
      const spanName = `temporal.activity.${info.activityType}`

      return tracer.startActiveSpan(
        spanName,
        {
          attributes: {
            "temporal.activity.type": info.activityType,
            "temporal.workflow.type": info.workflowType,
            "temporal.workflow.namespace": info.workflowNamespace,
            "temporal.task_queue": info.taskQueue,
            "temporal.activity.id": info.activityId,
            "temporal.attempt": info.attempt,
          },
        },
        async (span) => {
          try {
            const result = await next(input)
            span.setStatus({ code: SpanStatusCode.OK })
            return result
          } catch (error) {
            // Activity-internal Effect spans already capture the exception with
            // the richer Effect stack; avoid duplicating it on the root span.
            const err = toError(error)
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
            throw err
          } finally {
            span.end()
          }
        },
      )
    },
  },
})

const logger = createLogger("workflows-temporal-worker")

export interface RunTemporalWorkerInput {
  readonly config: TemporalConfig
  readonly workflowsPath: string
  readonly activities: Record<string, (...args: never[]) => unknown>
}

export async function runTemporalWorker(input: RunTemporalWorkerInput) {
  const { config, workflowsPath, activities } = input

  logger.info("connecting Temporal worker", {
    address: config.address,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath,
  })

  const useCloud = config.apiKey !== undefined && config.apiKey.length > 0

  const connection = await NativeConnection.connect({
    address: config.address,
    ...(useCloud ? { tls: true as const, apiKey: config.apiKey } : {}),
  })

  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath,
    activities,
    interceptors: {
      activity: [datadogActivityInterceptor],
    },
  })

  const runPromise = worker.run()

  return {
    runPromise,
    shutdown: async () => {
      worker.shutdown()
      await runPromise
      await connection.close()
    },
  }
}
