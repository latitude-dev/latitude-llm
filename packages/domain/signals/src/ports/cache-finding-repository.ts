import type { ProjectId, RepositoryError, SignalId, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CacheFinding } from "../entities/cache-finding.ts"

/** A finding plus its signal's public slug, which is what a link to the inbox needs. */
export type CacheFindingWithSignal = CacheFinding & { readonly signalSlug: string }

export interface CacheFindingRepositoryShape {
  /**
   * Every cache finding whose signal is still open in this project — not resolved, not
   * ignored, not soft-deleted.
   *
   * This is both the dedupe read for the producer and the panel's "a signal already
   * exists for this model" read, so the two cannot disagree about what is open.
   */
  listOpenByProject(input: {
    readonly projectId: ProjectId
  }): Effect.Effect<readonly CacheFindingWithSignal[], RepositoryError, SqlClient>
  findBySignalId(input: { readonly signalId: SignalId }): Effect.Effect<CacheFinding | null, RepositoryError, SqlClient>
  /**
   * Insert or refresh by `(organizationId, projectId, fingerprint)`.
   *
   * On conflict the measures and `lastObservedAt` move and `firstObservedAt` does not —
   * a finding that keeps being true is the same finding, and its age is what tells a
   * reader whether anyone has acted.
   */
  upsert(finding: CacheFinding): Effect.Effect<void, RepositoryError, SqlClient>
  /** Drops the projection rows for signals whose finding cleared; the signals themselves are resolved. */
  deleteBySignalIds(input: {
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
  }): Effect.Effect<void, RepositoryError, SqlClient>
}

export class CacheFindingRepository extends Context.Service<CacheFindingRepository, CacheFindingRepositoryShape>()(
  "@domain/signals/CacheFindingRepository",
) {}
