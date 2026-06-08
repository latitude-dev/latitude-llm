import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SANDBOX_IDLE_ARCHIVE_DAYS } from "../constants.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"

const MS_PER_DAY = 24 * 60 * 60_000

export interface ArchiveIdleSandboxesResult {
  readonly archived: number
}

/**
 * Daily idle sweep: archive every `active` sandbox whose `last_activity_at` is
 * older than the flat `SANDBOX_IDLE_ARCHIVE_DAYS` threshold (`now - 7d`). The
 * threshold is the same for every sandbox, independent of plan — no plan resolved.
 *
 * Cross-org: runs on the admin client. The find + archive happen in one atomic
 * `archiveIdle(cutoff)` UPDATE, so it's idempotent (the `status = active` guard
 * skips already-archived rows). Reactivation and the ingest refusal on archived
 * sandboxes are out of scope here.
 */
export const archiveIdleSandboxesUseCase = (deps?: {
  /** Injected for determinism in tests; defaults to wall-clock now. */
  readonly now?: () => Date
}): Effect.Effect<ArchiveIdleSandboxesResult, RepositoryError, SqlClient | SandboxRepository> =>
  Effect.gen(function* () {
    const repository = yield* SandboxRepository
    const now = (deps?.now ?? (() => new Date()))()
    const cutoff = new Date(now.getTime() - SANDBOX_IDLE_ARCHIVE_DAYS * MS_PER_DAY)

    const archived = yield* repository.archiveIdle(cutoff)

    return { archived } satisfies ArchiveIdleSandboxesResult
  }).pipe(Effect.withSpan("sandboxes.archiveIdleSandboxes"))
