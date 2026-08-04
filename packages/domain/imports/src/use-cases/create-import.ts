import { OutboxEventWriter } from "@domain/events"
import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { IMPORT_SOURCE_PAGE_SIZE_MAX } from "../constants.ts"
import { type CreateImportInput, createImportJob } from "../entities/import-job.ts"
import type { ImportLimits } from "../entities/import-limits.ts"
import { defaultImportStats } from "../entities/import-source.ts"
import { ActiveImportConflictError, ImportRangeInvalidError, ImportUsageExhaustedError } from "../errors.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"
import { importUsageAvailable } from "./import-usage-available.ts"
import { importLimitsForPlan } from "./resolve-import-limits.ts"

const DAY_MS = 24 * 60 * 60 * 1000

const rangeDays = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS)

// Compared in milliseconds, not in rounded-up days: rounding would let any non-empty
// range satisfy the one-day floor, so a reversed or minutes-wide range would pass.
const validateLookback = (from: Date, to: Date, limits: ImportLimits): Effect.Effect<void, ImportRangeInvalidError> => {
  const elapsedMs = to.getTime() - from.getTime()
  const requestedDays = Math.round(elapsedMs / DAY_MS)

  if (elapsedMs < limits.minLookbackDays * DAY_MS) {
    return Effect.fail(
      new ImportRangeInvalidError({
        message: `Lookback must be at least ${limits.minLookbackDays} day`,
        requestedDays,
      }),
    )
  }
  if (elapsedMs > limits.maxLookbackDays * DAY_MS) {
    return Effect.fail(
      new ImportRangeInvalidError({
        message: limits.lookbackLimitedByRetention
          ? `Lookback cannot exceed ${limits.maxLookbackDays} days, the span retention on the ${limits.planSlug} plan`
          : `Lookback cannot exceed ${limits.maxLookbackDays} days`,
        requestedDays,
      }),
    )
  }
  return Effect.void
}

export const createImportUseCase = (input: CreateImportInput) =>
  Effect.gen(function* () {
    const limits = importLimitsForPlan(input.plan)
    // Refused up front rather than left to pause on its first page, which would import nothing
    // and read as a broken job.
    if (!(yield* importUsageAvailable(input.plan))) {
      return yield* Effect.fail(new ImportUsageExhaustedError({ periodEnd: input.plan.periodEnd }))
    }

    yield* validateLookback(input.config.rangeFrom, input.config.rangeTo, limits)

    const config = {
      ...input.config,
      maxTraces: Math.min(input.config.maxTraces, limits.maxTraces),
      sourcePageSize: Math.min(input.config.sourcePageSize, IMPORT_SOURCE_PAGE_SIZE_MAX),
    }

    const jobs = yield* ImportJobRepository
    const active = yield* jobs.findActive()
    if (active) {
      return yield* Effect.fail(new ActiveImportConflictError({ activeJobId: active.id }))
    }

    const job = createImportJob({
      organizationId: input.organizationId,
      projectId: input.projectId,
      source: input.source,
      config,
      credentials: input.credentials,
      stats: defaultImportStats(),
    })

    const outboxEventWriter = yield* OutboxEventWriter
    const sqlClient = yield* SqlClient

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        yield* jobs.save(job)
        yield* outboxEventWriter.write({
          eventName: "ImportStarted",
          aggregateType: "import-job",
          aggregateId: job.id,
          organizationId: job.organizationId,
          payload: {
            organizationId: job.organizationId,
            actorUserId: input.createdByUserId,
            projectId: job.projectId,
            importJobId: job.id,
            source: job.source,
            maxTraces: job.config.maxTraces,
            rangeDays: rangeDays(job.config.rangeFrom, job.config.rangeTo),
          },
        })
      }),
    )

    return job
  }).pipe(Effect.withSpan("imports.create"))
