import type { ImportJobId } from "@domain/shared"
import { Effect } from "effect"
import { ImportJobNotEnqueueableError, ImportJobNotFoundError } from "../errors.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"

interface EnqueueImportInput {
  readonly importJobId: ImportJobId
}

interface EnqueueImportDeps {
  readonly publish: (input: {
    readonly organizationId: string
    readonly projectId: string
    readonly importJobId: string
  }) => Effect.Effect<void, unknown>
}

/**
 * Hands a freshly created job to the worker: the only writer of `queued`, and the only
 * accepter of `created`, so a job cannot be enqueued twice. Reads the job back rather than
 * trusting the caller's copy, so the status it gates on is the persisted one.
 *
 * Must not run inside a transaction: a queue publish does not roll back with one, and a
 * worker reading on its own connection would find the job absent or still `created` and,
 * because `startImport` treats an unexpected status as nothing to do, complete the message
 * without starting anything. Publishing after the commit trades that for a failure the
 * compensating write below settles.
 */
export const enqueueImportUseCase =
  ({ publish }: EnqueueImportDeps) =>
  (input: EnqueueImportInput) =>
    Effect.gen(function* () {
      const jobs = yield* ImportJobRepository
      const job = yield* jobs.findById(input.importJobId)
      if (!job) {
        return yield* Effect.fail(new ImportJobNotFoundError({ jobId: input.importJobId }))
      }

      if (job.status !== "created") {
        return yield* Effect.fail(new ImportJobNotEnqueueableError({ jobId: job.id, status: job.status }))
      }

      const queued = (yield* jobs.updateStatus(job.id, "queued")) ?? job

      yield* publish({
        organizationId: queued.organizationId,
        projectId: queued.projectId,
        importJobId: queued.id,
      }).pipe(
        Effect.tapError(() =>
          jobs.markFailedIfActive(queued.id, {
            error: "Import queue publish failed",
            finishedAt: new Date(),
          }),
        ),
      )

      return queued
    }).pipe(Effect.withSpan("imports.enqueue"))
