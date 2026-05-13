import {
  type AuthorizedBillableActionContext,
  type RecordTraceUsageBatchInput,
  recordBillableActionUseCase,
  recordTraceUsageBatchUseCase,
} from "@domain/billing"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import {
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("billing")

export const TRACE_USAGE_BATCH_FLUSH_MS = 250
const TRACE_USAGE_BATCH_MAX_TRACES = 5_000

interface BillingDeps {
  consumer: QueueConsumer
  postgresClient: PostgresClient
}

interface RecordTraceUsageBatchPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly planSlug: "free" | "pro" | "enterprise"
  readonly planSource: "override" | "subscription" | "free-fallback"
  readonly periodStart: string
  readonly periodEnd: string
  readonly includedCredits: number
  readonly overageAllowed: boolean
}

interface RecordBillableActionPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly action: "trace" | "flagger-scan" | "live-eval-scan" | "eval-generation"
  readonly idempotencyKey: string
  readonly context: {
    readonly planSlug: "free" | "pro" | "enterprise"
    readonly planSource: "override" | "subscription" | "free-fallback"
    readonly periodStart: string
    readonly periodEnd: string
    readonly includedCredits: number
    readonly overageAllowed: boolean
  }
  readonly traceId?: string
  readonly metadata?: Record<string, unknown>
}

interface TraceUsageBatcherDeps {
  readonly flushMs: number
  readonly maxTraces: number
  readonly runBatch: (input: RecordTraceUsageBatchInput) => Promise<void>
}

interface PendingTraceUsageJob {
  readonly payload: RecordTraceUsageBatchPayload
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

interface PendingTraceUsageGroup {
  readonly key: string
  readonly basePayload: RecordTraceUsageBatchPayload
  readonly jobs: PendingTraceUsageJob[]
  traceCount: number
  timer: ReturnType<typeof setTimeout> | undefined
}

const buildTraceUsageBatchKey = (payload: RecordTraceUsageBatchPayload): string =>
  [
    payload.organizationId,
    payload.periodStart,
    payload.periodEnd,
    payload.planSlug,
    payload.planSource,
    payload.includedCredits,
    payload.overageAllowed,
  ].join(":")

const toRecordTraceUsageBatchInput = (group: PendingTraceUsageGroup): RecordTraceUsageBatchInput => ({
  organizationId: OrganizationId(group.basePayload.organizationId),
  traceUsages: group.jobs.flatMap(({ payload }) =>
    payload.traceIds.map((traceId) => ({
      projectId: ProjectId(payload.projectId),
      traceId: TraceId(traceId),
    })),
  ),
  planSlug: group.basePayload.planSlug,
  planSource: group.basePayload.planSource,
  periodStart: new Date(group.basePayload.periodStart),
  periodEnd: new Date(group.basePayload.periodEnd),
  includedCredits: group.basePayload.includedCredits,
  overageAllowed: group.basePayload.overageAllowed,
})

const createTraceUsageBatcher = ({ flushMs, maxTraces, runBatch }: TraceUsageBatcherDeps) => {
  const groups = new Map<string, PendingTraceUsageGroup>()

  const flushGroup = async (key: string): Promise<void> => {
    const group = groups.get(key)
    if (!group) return

    groups.delete(key)
    if (group.timer) clearTimeout(group.timer)

    try {
      await runBatch(toRecordTraceUsageBatchInput(group))
      for (const job of group.jobs) {
        job.resolve()
      }
    } catch (error) {
      for (const job of group.jobs) {
        job.reject(error)
      }
    }
  }

  return {
    enqueue: (payload: RecordTraceUsageBatchPayload): Promise<void> =>
      new Promise((resolve, reject) => {
        const key = buildTraceUsageBatchKey(payload)
        let group = groups.get(key)

        if (!group) {
          group = {
            key,
            basePayload: payload,
            jobs: [],
            traceCount: 0,
            timer: setTimeout(() => void flushGroup(key), flushMs),
          }
          groups.set(key, group)
        }

        group.jobs.push({ payload, resolve, reject })
        group.traceCount += payload.traceIds.length

        if (group.traceCount >= maxTraces) {
          void flushGroup(key)
        }
      }),
  }
}

const billingLayers = Layer.mergeAll(
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

export const createBillingWorker = ({ consumer, postgresClient }: BillingDeps) => {
  const pgClient = postgresClient

  const recordBillableActionJob = Effect.fn("workers.billing.recordBillableAction")(function* (
    payload: RecordBillableActionPayload,
  ) {
    return yield* recordBillableActionUseCase({
      organizationId: OrganizationId(payload.organizationId),
      projectId: ProjectId(payload.projectId),
      action: payload.action,
      idempotencyKey: payload.idempotencyKey,
      context: {
        planSlug: payload.context.planSlug,
        planSource: payload.context.planSource,
        periodStart: new Date(payload.context.periodStart),
        periodEnd: new Date(payload.context.periodEnd),
        includedCredits: payload.context.includedCredits,
        overageAllowed: payload.context.overageAllowed,
      } satisfies AuthorizedBillableActionContext,
      ...(payload.traceId ? { traceId: TraceId(payload.traceId) } : {}),
      ...(payload.metadata ? { metadata: payload.metadata } : {}),
    })
  })

  const recordTraceUsageBatchJob = Effect.fn("workers.billing.recordTraceUsageBatch")(function* (
    input: RecordTraceUsageBatchInput,
  ) {
    return yield* recordTraceUsageBatchUseCase(input)
  })

  const traceUsageBatcher = createTraceUsageBatcher({
    flushMs: TRACE_USAGE_BATCH_FLUSH_MS,
    maxTraces: TRACE_USAGE_BATCH_MAX_TRACES,
    runBatch: (input) =>
      Effect.runPromise(
        recordTraceUsageBatchJob(input).pipe(withPostgres(billingLayers, pgClient, input.organizationId), withTracing),
      ).then(() => undefined),
  })

  consumer.subscribe(
    "billing",
    {
      recordBillableAction: (payload: RecordBillableActionPayload) =>
        recordBillableActionJob(payload).pipe(
          withPostgres(billingLayers, pgClient, OrganizationId(payload.organizationId)),
          withTracing,
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error("Billing record billable action failed", {
                organizationId: payload.organizationId,
                projectId: payload.projectId,
                action: payload.action,
                idempotencyKey: payload.idempotencyKey,
                error,
              }),
            ),
          ),
          Effect.asVoid,
        ),

      recordTraceUsageBatch: (payload: RecordTraceUsageBatchPayload) =>
        Effect.tryPromise({
          try: () => traceUsageBatcher.enqueue(payload),
          catch: (cause) => cause,
        }).pipe(
          withTracing,
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error("Billing trace usage batch failed", {
                organizationId: payload.organizationId,
                projectId: payload.projectId,
                traceCount: payload.traceIds.length,
                error,
              }),
            ),
          ),
          Effect.asVoid,
        ),
    },
    { concurrency: 50 },
  )
}
