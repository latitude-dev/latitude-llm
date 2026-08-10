import type { ImportJobId } from "@domain/shared"
import { Effect } from "effect"
import { ImportJobNotFoundError } from "../errors.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"
import { finishImport } from "./finish-import.ts"

interface CancelImportInput {
  readonly importJobId: ImportJobId
}

export const cancelImportUseCase = (input: CancelImportInput) =>
  Effect.gen(function* () {
    const jobs = yield* ImportJobRepository
    const job = yield* jobs.findById(input.importJobId)
    if (!job) {
      return yield* Effect.fail(new ImportJobNotFoundError({ jobId: input.importJobId }))
    }

    // Settled here rather than stamped: a `created` job has no queue message, so no worker
    // would ever cooperate with the request, and the row would hold the org's only import
    // slot — which `created` claims through the `..._org_active_uq` predicate — forever.
    if (job.status === "created") return yield* finishImport(job, "cancelled")

    if (job.status !== "queued" && job.status !== "running") return job

    // Cooperative from here: the worker flips the status between pages, so this only stamps
    // the request. Returns the persisted row so the caller reports the stamp it actually wrote.
    const cancelled = yield* jobs.updateStatus(job.id, job.status, { cancelledAt: new Date() })
    return cancelled ?? job
  }).pipe(Effect.withSpan("imports.cancel"))
