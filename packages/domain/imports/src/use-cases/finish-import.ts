import { OutboxEventWriter } from "@domain/events"
import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { ImportJob, ImportStatus } from "../entities/import-job.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"

/** The states an import can end in. Anything else is still in flight. */
type TerminalImportStatus = Extract<ImportStatus, "succeeded" | "capped" | "cancelled" | "failed">

type TerminalPatch = Partial<Pick<ImportJob, "cursor" | "stats" | "runs" | "error">>

/**
 * Moves a job to a terminal state and emits `ImportFinished` in the same step.
 * Terminal transitions happen at nine points in the page loop, so pairing the
 * two here is what stops one of them from silently skipping the analytics event.
 * Transactional, so a job can never read as finished with no event behind it.
 * Always scrubs credentials — no terminal state has any further use for them.
 */
export const finishImport = (job: ImportJob, status: TerminalImportStatus, patch: TerminalPatch = {}) =>
  Effect.gen(function* () {
    const jobs = yield* ImportJobRepository
    const outboxEventWriter = yield* OutboxEventWriter
    const sqlClient = yield* SqlClient
    const finishedAt = new Date()

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const finished = (yield* jobs.updateStatus(job.id, status, { ...patch, finishedAt, credentials: null })) ?? job

        yield* outboxEventWriter.write({
          eventName: "ImportFinished",
          aggregateType: "import-job",
          aggregateId: finished.id,
          organizationId: finished.organizationId,
          payload: {
            organizationId: finished.organizationId,
            projectId: finished.projectId,
            importJobId: finished.id,
            source: finished.source,
            status,
            error: finished.error,
            recordsFetched: finished.stats.recordsFetched,
            tracesImported: finished.stats.tracesImported,
            spansImported: finished.stats.spansImported,
            spansSkipped: finished.stats.spansSkipped,
            durationMs: finished.startedAt ? finishedAt.getTime() - finished.startedAt.getTime() : 0,
          },
        })

        return finished
      }),
    )
  })
