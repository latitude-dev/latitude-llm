import type { ProjectId, RepositoryError, SignalId, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CacheFinding } from "../entities/cache-finding.ts"

/**
 * What became of the signal a finding opened.
 *
 * `archived` is a decision someone made — resolved or ignored from the inbox — and is the
 * reason this read returns rows the panel will never show: a finding measured from steady
 * traffic is still true the next day, so hiding archived rows from the producer would have
 * it open a fresh signal on every sweep, arguing with the user daily. The row is the
 * tombstone that stops that.
 *
 * `gone` is a soft-deleted or missing signal, which is not a decision to suppress anything
 * — the finding may open a new signal and take the row over.
 */
export const CACHE_FINDING_SIGNAL_STATUSES = ["open", "archived", "gone"] as const
export type CacheFindingSignalStatus = (typeof CACHE_FINDING_SIGNAL_STATUSES)[number]

export type CacheFindingWithSignal = CacheFinding & {
  /** Null when the signal is gone; otherwise its public slug, which is what a link to the inbox needs. */
  readonly signalSlug: string | null
  readonly signalStatus: CacheFindingSignalStatus
}

export interface CacheFindingRepositoryShape {
  /**
   * Every cache finding in the project, whatever became of its signal.
   *
   * Deliberately unfiltered: the producer needs the archived rows to stay quiet, and the
   * panel filters to `open` itself. One query, so the dedupe read and the "a signal already
   * exists for this model" read cannot disagree about what is open.
   */
  listByProject(input: {
    readonly projectId: ProjectId
  }): Effect.Effect<readonly CacheFindingWithSignal[], RepositoryError, SqlClient>
  findBySignalId(input: { readonly signalId: SignalId }): Effect.Effect<CacheFinding | null, RepositoryError, SqlClient>
  /**
   * Insert or refresh by `(organizationId, projectId, fingerprint)`.
   *
   * On conflict the measures, `lastObservedAt` and `signalId` move while `firstObservedAt`
   * does not — a finding that keeps being true is the same finding, and its age is what
   * tells a reader whether anyone has acted. `signalId` moves so a finding whose signal was
   * deleted can take its own row over rather than leaving the new signal unlinked.
   */
  upsert(finding: CacheFinding): Effect.Effect<void, RepositoryError, SqlClient>
  /** Drops the projection rows for findings that cleared, once their signals are archived. */
  deleteBySignalIds(input: {
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
  }): Effect.Effect<void, RepositoryError, SqlClient>
}

export class CacheFindingRepository extends Context.Service<CacheFindingRepository, CacheFindingRepositoryShape>()(
  "@domain/signals/CacheFindingRepository",
) {}
