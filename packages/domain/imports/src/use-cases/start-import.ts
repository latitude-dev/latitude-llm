import type { QueuePublisherShape } from "@domain/queue"
import type { ImportJobId } from "@domain/shared"
import { Effect } from "effect"
import { IMPORT_MAX_ATTEMPTS, IMPORT_RETRY_BACKOFF_MS } from "../constants.ts"
import { ImportJobNotFoundError } from "../errors.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"

interface StartImportInput {
  readonly importJobId: ImportJobId
}

interface StartImportDeps {
  readonly publish: (input: {
    readonly organizationId: string
    readonly projectId: string
    readonly importJobId: string
  }) => Effect.Effect<void, unknown>
}

export const startImportUseCase =
  ({ publish }: StartImportDeps) =>
  (input: StartImportInput) =>
    Effect.gen(function* () {
      const jobs = yield* ImportJobRepository
      const job = yield* jobs.findById(input.importJobId)
      if (!job) {
        return yield* Effect.fail(new ImportJobNotFoundError({ jobId: input.importJobId }))
      }

      if (job.status !== "queued") return job

      const running = (yield* jobs.updateStatus(job.id, "running", { startedAt: new Date() })) ?? job

      yield* publish({
        organizationId: running.organizationId,
        projectId: running.projectId,
        importJobId: running.id,
      }).pipe(
        Effect.tapError(() =>
          jobs.markFailedIfActive(running.id, {
            error: "Import queue publish failed",
            finishedAt: new Date(),
          }),
        ),
      )

      return running
    }).pipe(Effect.withSpan("imports.start"))

export const createFetchPagePublisher =
  (publisher: QueuePublisherShape) =>
  (
    payload: {
      readonly organizationId: string
      readonly projectId: string
      readonly importJobId: string
      readonly rateLimitWaits?: number
    },
    options?: { readonly delayMs: number },
  ) =>
    publisher.publish("imports", "fetchPage", payload, {
      attempts: IMPORT_MAX_ATTEMPTS,
      backoff: { type: "exponential", delayMs: IMPORT_RETRY_BACKOFF_MS },
      ...(options?.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
    })
