import type { EffectivePlanResolution } from "@domain/billing"
import { OutboxEventWriter } from "@domain/events"
import { type ImportJobId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { createImportJob, type ImportStatus } from "../entities/import-job.ts"
import type { ImportCredentials } from "../entities/import-source.ts"
import {
  ActiveImportConflictError,
  ImportJobNotFoundError,
  ImportJobNotRetryableError,
  ImportRegionMismatchError,
  ImportUsageExhaustedError,
} from "../errors.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"
import { importUsageAvailable } from "./import-usage-available.ts"

interface RetryImportInput {
  readonly importJobId: ImportJobId
  readonly credentials: ImportCredentials
  readonly plan: EffectivePlanResolution
}

/**
 * The states a job can be resumed from. `capped` belongs here as much as a failure does, and
 * arguably more: it stopped for a reason the user can fix — a trace ceiling they raise via
 * `maxTraces`, or plan usage the period reset has since restored — and its cursor points exactly
 * where it left off. `succeeded` stays out because its cursor is exhausted, so resuming would do
 * nothing.
 */
const RESUMABLE_STATUSES = ["failed", "cancelled", "capped"] as const
type ResumableStatus = (typeof RESUMABLE_STATUSES)[number]

const isResumable = (status: ImportStatus): status is ResumableStatus =>
  (RESUMABLE_STATUSES as readonly ImportStatus[]).includes(status)

export const retryImportUseCase = (input: RetryImportInput) =>
  Effect.gen(function* () {
    const jobs = yield* ImportJobRepository
    const job = yield* jobs.findById(input.importJobId)
    if (!job) {
      return yield* Effect.fail(new ImportJobNotFoundError({ jobId: input.importJobId }))
    }

    if (!isResumable(job.status)) {
      return yield* Effect.fail(new ImportJobNotRetryableError({ jobId: job.id, status: job.status }))
    }
    const fromStatus = job.status

    // A resumed cursor only means anything against the deployment it was read from, and the
    // job's `sourceBaseUrl` is what the engine will use regardless — so fresh credentials
    // naming another region are a new import, not a retry.
    if (input.credentials.region !== job.config.sourceRegion) {
      return yield* Effect.fail(
        new ImportRegionMismatchError({
          jobId: job.id,
          expected: job.config.sourceRegion,
          received: input.credentials.region,
        }),
      )
    }

    const active = yield* jobs.findActive()
    if (active) {
      return yield* Effect.fail(
        new ActiveImportConflictError({
          activeJobId: active.id,
          activeProjectId: active.projectId,
          activeSourceProjectName: active.config.sourceProjectName,
        }),
      )
    }

    // A `capped` job stopped because the plan had no usage left, and the engine re-checks that
    // before reading a page — so resuming while it is still exhausted would enqueue a job that
    // caps again having imported nothing. Refuse it here instead, and say when usage returns.
    if (!(yield* importUsageAvailable(input.plan))) {
      return yield* Effect.fail(new ImportUsageExhaustedError({ periodEnd: input.plan.periodEnd }))
    }

    // Resumes from the failed job's cursor and carries its counts forward: re-reading
    // the whole range would be wasted quota against sources we deliberately rate-limit,
    // and deterministic span ids make picking up mid-range safe.
    const retryJob = createImportJob({
      organizationId: job.organizationId,
      projectId: job.projectId,
      source: job.source,
      config: job.config,
      credentials: input.credentials,
      cursor: job.cursor,
      stats: job.stats,
    })

    const outboxEventWriter = yield* OutboxEventWriter
    const sqlClient = yield* SqlClient

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        yield* jobs.save(retryJob)
        yield* outboxEventWriter.write({
          eventName: "ImportRetried",
          aggregateType: "import-job",
          aggregateId: retryJob.id,
          organizationId: retryJob.organizationId,
          payload: {
            organizationId: retryJob.organizationId,
            projectId: retryJob.projectId,
            importJobId: retryJob.id,
            fromJobId: job.id,
            fromStatus,
            fromError: job.error,
            fromTraces: retryJob.stats.tracesImported,
          },
        })
      }),
    )

    return retryJob
  }).pipe(Effect.withSpan("imports.retry"))
