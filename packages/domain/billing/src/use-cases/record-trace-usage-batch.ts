import { OutboxEventWriter } from "@domain/events"
import type { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { generateId, SqlClient, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { ACTION_CREDITS, buildBillingIdempotencyKey, persistedIncludedCreditsForPlan } from "../constants.ts"
import type { BillingUsageEvent } from "../entities/billing-usage-event.ts"
import type { BillingUsagePeriod } from "../entities/billing-usage-period.ts"
import { BillingUsageEventRepository } from "../ports/billing-usage-event-repository.ts"
import { BillingUsagePeriodRepository } from "../ports/billing-usage-period-repository.ts"

export interface RecordTraceUsage {
  readonly projectId: ProjectId
  readonly traceId: TraceId
}

export interface RecordTraceUsageBatchInput {
  readonly organizationId: OrganizationId
  readonly traceUsages: readonly RecordTraceUsage[]
  readonly planSlug: BillingUsagePeriod["planSlug"]
  readonly planSource: "override" | "subscription" | "free-fallback"
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly includedCredits: number
  readonly overageAllowed: boolean
}

const emptyPeriod = (input: RecordTraceUsageBatchInput): BillingUsagePeriod => ({
  organizationId: input.organizationId,
  planSlug: input.planSlug,
  periodStart: input.periodStart,
  periodEnd: input.periodEnd,
  includedCredits: persistedIncludedCreditsForPlan(input.planSlug, input.includedCredits),
  consumedCredits: 0,
  overageCredits: 0,
  reportedOverageCredits: 0,
  overageAmountMills: 0,
  updatedAt: new Date(),
})

const loadCurrentOrEmptyPeriod = Effect.fn("billing.loadCurrentOrEmptyTraceUsagePeriod")(function* (
  input: RecordTraceUsageBatchInput,
) {
  const periodRepo = yield* BillingUsagePeriodRepository
  const current = yield* periodRepo.findOptionalByPeriod({
    organizationId: input.organizationId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })

  return current ?? emptyPeriod(input)
})

const uniqueTraceUsagesByProjectAndTrace = (traceUsages: readonly RecordTraceUsage[]): readonly RecordTraceUsage[] => {
  const byProjectAndTrace = new Map<string, RecordTraceUsage>()

  for (const traceUsage of traceUsages) {
    const key = `${traceUsage.projectId}:${traceUsage.traceId}`
    if (!byProjectAndTrace.has(key)) {
      byProjectAndTrace.set(key, traceUsage)
    }
  }

  return [...byProjectAndTrace.values()]
}

const buildTraceUsageEvents = (
  input: RecordTraceUsageBatchInput,
  traceUsages: readonly RecordTraceUsage[],
  happenedAt: Date,
) =>
  traceUsages.map(
    ({ projectId, traceId }) =>
      ({
        id: generateId(),
        organizationId: input.organizationId,
        projectId,
        action: "trace",
        credits: ACTION_CREDITS.trace,
        idempotencyKey: buildBillingIdempotencyKey("trace", [input.organizationId, projectId, traceId]),
        traceId,
        metadata: undefined,
        happenedAt,
        billingPeriodStart: input.periodStart,
        billingPeriodEnd: input.periodEnd,
      }) satisfies BillingUsageEvent,
  )

const writeBillingUsagePeriodUpdatedEvent = Effect.fn("billing.writeTraceUsagePeriodUpdated")(function* (input: {
  readonly recordInput: RecordTraceUsageBatchInput
  readonly updated: BillingUsagePeriod
}) {
  const outboxEventWriter = yield* OutboxEventWriter
  yield* outboxEventWriter
    .write({
      eventName: "BillingUsagePeriodUpdated",
      aggregateType: "billing-usage-period",
      aggregateId: input.recordInput.organizationId,
      organizationId: input.recordInput.organizationId,
      payload: {
        organizationId: input.recordInput.organizationId,
        periodStart: input.updated.periodStart.toISOString(),
        periodEnd: input.updated.periodEnd.toISOString(),
        planSource: input.recordInput.planSource,
        overageAllowed: input.recordInput.overageAllowed,
        includedCredits: input.updated.includedCredits,
        consumedCredits: input.updated.consumedCredits,
        overageCredits: input.updated.overageCredits,
        reportedOverageCredits: input.updated.reportedOverageCredits,
      },
    })
    .pipe(Effect.mapError((error) => toRepositoryError(error, "outbox.writeBillingUsagePeriodUpdated")))
})

export const recordTraceUsageBatchUseCase = Effect.fn("billing.recordTraceUsageBatch")(function* (
  input: RecordTraceUsageBatchInput,
) {
  yield* Effect.annotateCurrentSpan("billing.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("billing.action", "trace")
  yield* Effect.annotateCurrentSpan("billing.traceCount", input.traceUsages.length)

  const sqlClient = yield* SqlClient
  const eventRepo = yield* BillingUsageEventRepository

  const uniqueTraceUsages = uniqueTraceUsagesByProjectAndTrace(input.traceUsages)
  if (uniqueTraceUsages.length === 0) {
    return yield* loadCurrentOrEmptyPeriod(input)
  }

  const updated = yield* sqlClient.transaction(
    Effect.gen(function* () {
      const periodRepo = yield* BillingUsagePeriodRepository
      const events = buildTraceUsageEvents(input, uniqueTraceUsages, new Date())
      const insertedCount = yield* eventRepo.insertMany(events)
      if (insertedCount === 0) {
        return yield* loadCurrentOrEmptyPeriod(input)
      }

      const updated = yield* periodRepo.appendCreditsForBillingPeriod({
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        planSlug: input.planSlug,
        persistedIncludedCredits: persistedIncludedCreditsForPlan(input.planSlug, input.includedCredits),
        creditsDelta: insertedCount * ACTION_CREDITS.trace,
      })

      yield* writeBillingUsagePeriodUpdatedEvent({
        recordInput: input,
        updated,
      })

      return updated
    }),
  )

  return updated
})
