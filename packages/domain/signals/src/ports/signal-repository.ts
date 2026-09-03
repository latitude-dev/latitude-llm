import type {
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  ScoreDimension,
  SignalId,
  SqlClient,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Signal, SignalFeedback, SignalScoreEvidence } from "../entities/signal.ts"

/**
 * Lifecycle flags derived from `alert_incidents` rows joined onto an issue
 * read. These are the stored truth for "is this issue currently escalating /
 * regressed" — see `deriveSignalLifecycleStates`.
 */
export interface SignalLifecycleFlags {
  readonly isEscalating: boolean
}

/**
 * Signal payload returned by read methods that JOIN `alert_incidents`. The
 * lifecycle flags are attached as an extra property so existing consumers
 * that just read `Signal` columns (e.g. `issue.name`, `issue.projectId`)
 * keep working without changes.
 */
export type SignalWithLifecycle = Signal & { readonly lifecycle: SignalLifecycleFlags }

export interface SignalListPage {
  readonly items: readonly SignalWithLifecycle[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface SignalSearchCandidate {
  readonly signalId: SignalId
  readonly name: string
  readonly description: string
  readonly score: number
}

export interface SignalScoreEvidenceBackfillTarget {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
}

/**
 * One semantic neighbor of an issue: another issue in the same project ranked
 * by cosine similarity between the two `centroid_embedding` vectors.
 */
export interface SignalCentroidNeighbor {
  readonly signalId: SignalId
  /** Cosine similarity in `[-1, 1]` (in practice `[0, 1]` for feedback embeddings). */
  readonly similarity: number
}

/**
 * One org-wide search hit for the Command Palette: the matched issue (with lifecycle flags so the
 * caller can derive its states without a second read) plus its owning project's slug/name and the
 * relevance score of whichever tier produced it.
 */
export interface OrgSignalSearchHit {
  readonly issue: SignalWithLifecycle
  readonly projectSlug: string
  readonly projectName: string
  readonly score: number
}

export interface ListSignalsRepositoryInput {
  readonly projectId: ProjectId
  readonly limit: number
  readonly offset: number
}

export interface ListSignalTableRowsRepositoryInput extends ListSignalsRepositoryInput {
  readonly lifecycleGroup?: "active" | "archived"
  readonly assigneeIds?: readonly string[]
  readonly scoreDimensions?: readonly ScoreDimension[]
  readonly searchQuery?: string
  readonly timeRange?: {
    readonly from?: Date
    readonly to?: Date
  }
  readonly sort?: {
    readonly field: "lastSeen" | "occurrences" | "affectedSessions" | "state"
    readonly direction: "asc" | "desc"
  }
}

export interface SignalTableRowsPage extends SignalListPage {
  readonly totalCount: number
}

/**
 * Reads exclude unpromoted signals by default. A signal whose `promoted_at` is
 * null has not accumulated enough evidence to exist for the product, so every
 * read method below is either **default-deny** — it filters unpromoted rows the
 * way it filters soft-deleted ones — or explicitly documented as seeing them.
 * The asymmetry is the design: discovery is the one place a candidate stays
 * visible, because that is how it accumulates the evidence that promotes it.
 *
 * Default-deny with an `includeUnpromoted` opt-in: `findById`, `hybridSearch`.
 * Default-deny with an `unpromotedOnly` opt-in: `findSimilarByCentroid`.
 * Default-deny with no opt-in: `findByIds`, `findBySlug`, `searchOrgWide`,
 * `list`, `listTableRows`, `listIdsCreatedInTimeRange`.
 * Never filtered: every write path, plus the two slug-uniqueness reads and
 * `findAbsorbedLineage`, which reads soft-deleted rows by definition.
 */
export interface SignalRepositoryShape {
  /** Default-deny: pass `includeUnpromoted` on discovery paths that must resolve a candidate. */
  findById(
    id: SignalId,
    options?: { readonly includeUnpromoted?: boolean },
  ): Effect.Effect<SignalWithLifecycle, NotFoundError | RepositoryError, SqlClient>
  /**
   * Locking read used by lifecycle write paths (resolve, ignore, etc.).
   * Returns plain `Signal` — lifecycle flags would require an extra JOIN
   * that callers in this path don't need.
   *
   * Unpromoted signals are **included**: this is a write path, and the score
   * assignment that promotes a candidate reads it through here.
   */
  findByIdForUpdate(id: SignalId): Effect.Effect<Signal, NotFoundError | RepositoryError, SqlClient>
  /**
   * Batch hydration for read surfaces whose candidate ids come from ClickHouse
   * (list, related, session, user, experiments). Unpromoted signals are omitted
   * from the result; every caller already tolerates a missing id, so dropping a
   * candidate here removes it from the items, the counts, and the histogram at
   * once.
   */
  findByIds(input: {
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
  }): Effect.Effect<readonly SignalWithLifecycle[], RepositoryError, SqlClient>
  /**
   * Serves two callers with opposite needs. Discovery passes
   * `includeUnpromoted: true` so a new score can cluster into a candidate; the
   * signals-list search box does not, so a candidate never surfaces as a hit.
   */
  hybridSearch(input: {
    readonly projectId: ProjectId
    readonly query: string
    readonly normalizedEmbedding: readonly number[]
    readonly includeUnpromoted?: boolean
  }): Effect.Effect<readonly SignalSearchCandidate[], RepositoryError, SqlClient>
  /**
   * Semantic neighbors for the Related-issues list: the project's other issues
   * ranked by cosine similarity against this signal's `centroid_embedding`
   * (exact scan, no ANN index — same trade-off as `hybridSearch`).
   *
   * Returns an empty list when the source issue is missing or has no embedding
   * (zero-mass centroid) — the semantic signal degrades to nothing rather than
   * failing the whole Related read. Resolved/ignored issues are **included**:
   * "a similar issue was already resolved" is the most actionable neighbor.
   * No similarity floor here; gating lives in the domain scorer.
   *
   * Unpromoted issues are excluded on both sides — the source read and the
   * neighbor scan — and `unpromotedOnly` inverts that on both sides rather than
   * relaxing it. Consolidation is the caller that needs it, and it may only ever
   * merge candidates into candidates, so restricting the scan is what makes that
   * a guarantee of this method rather than discipline in the use case.
   */
  findSimilarByCentroid(input: {
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly limit: number
    readonly unpromotedOnly?: boolean
  }): Effect.Effect<readonly SignalCentroidNeighbor[], RepositoryError, SqlClient>
  /**
   * Org-wide issue search across every project in the organization (RLS-scoped to the caller's
   * org), powering the Command Palette. Two tiers selected by `normalizedEmbedding`:
   *
   * - **Lexical** (no embedding): full-text match on the signal's search document OR a
   *   case-insensitive substring match on its name. Instant and index-backed (GIN).
   * - **Semantic** (embedding present): the hybrid vector + lexical relevance blend, surfacing
   *   related issues whose names don't literally contain the query.
   *
   * Each hit carries lifecycle flags and the owning project's slug/name. Resolved/ignored issues,
   * unpromoted issues, and issues in soft-deleted projects are excluded. The caller merges the two
   * tiers (lexical first) and caps the result.
   * When `preferProjectId` is set, that project's issues rank first *within each tier* (so a
   * current-project lexical hit still beats an other-project semantic hit) — the palette passes the
   * current project so local results lead.
   */
  searchOrgWide(input: {
    readonly query: string
    readonly normalizedEmbedding?: readonly number[]
    readonly preferProjectId?: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly OrgSignalSearchHit[], RepositoryError, SqlClient>
  /**
   * Point-lookup by `(projectId, slug)`. Slugs are org-unique (D15), so a slug
   * lives in at most one project; resolution stays project-scoped so a match is
   * only ever the caller's own project's signal. This is how every API and web
   * read resolves a signal, so an unpromoted slug resolves to `NotFoundError`.
   */
  findBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<SignalWithLifecycle, NotFoundError | RepositoryError, SqlClient>
  /**
   * Cheap existence check for slug uniqueness paths. Counts unpromoted signals:
   * a candidate holds its slug for real, and skipping it would hand the same
   * slug out twice and collide with `signals_unique_slug_per_org_idx`.
   */
  existsBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Returns the number of non-deleted signals with this slug in the active
   * organization — org-wide, spanning every project (D15). Powers the `count`
   * callback of `generateSignalSlug`; a soft-deleted signal frees its slug.
   * Unpromoted signals count, for the same reason as `existsBySlug`.
   */
  countBySlug(input: {
    readonly slug: string
    readonly excludeSignalId?: SignalId
  }): Effect.Effect<number, RepositoryError, SqlClient>
  save(issue: Signal): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Platform-wide admin scan for the score-evidence backfill. Returns only
   * tenant and entity ids so each target is re-read through its organization-
   * scoped repository before classification.
   */
  listScoreEvidenceBackfillTargets(input: {
    readonly since?: Date
    readonly promotedBefore: Date
    readonly organizationId?: OrganizationId
    readonly projectId?: ProjectId
    readonly limit?: number
  }): Effect.Effect<readonly SignalScoreEvidenceBackfillTarget[], RepositoryError, SqlClient>
  /**
   * Writes the generated classification only while score evidence is still
   * empty. Returns whether the conditional update matched the row.
   */
  setScoreEvidenceIfEmpty(input: {
    readonly signalId: SignalId
    readonly scoreEvidence: readonly SignalScoreEvidence[]
    readonly now: Date
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Atomic reopen-on-occurrence claim: clears `resolved_at` and stamps
   * `regressed_at` in one conditional UPDATE guarded on "currently resolved,
   * not ignored, and resolved before the occurrence" (so replayed historical
   * scores cannot reopen). Returns whether THIS call performed the reopen —
   * exactly one concurrent caller per regression cycle wins and emits the
   * follow-up `SignalRegressed` event; the rest see `false` and no-op.
   */
  claimReopenOnOccurrence(input: {
    readonly signalId: SignalId
    readonly occurredAt: Date
    readonly now: Date
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Atomic one-shot feedback claim: writes the customer's verdict in a single
   * conditional UPDATE guarded on `feedback IS NULL`. Returns whether THIS call
   * performed the write, so two concurrent submissions (two tabs, a UI click
   * racing an MCP call) resolve to exactly one recorded verdict with no
   * read-modify-write window.
   */
  claimFeedback(input: {
    readonly signalId: SignalId
    readonly feedback: SignalFeedback
    readonly now: Date
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /** Soft-delete: stamps `deleted_at` so the signal is excluded read-side and frees its slug. No-op if already deleted. */
  softDelete(id: SignalId): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Soft-deletes the absorbed candidates of a consolidation and points each at
   * its survivor, in one statement. The pointer is what lets a later merge find
   * everything that ever flowed into a signal; see `findAbsorbedLineage`.
   */
  markMerged(input: {
    readonly survivorId: SignalId
    readonly loserIds: readonly SignalId[]
    readonly now: Date
  }): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Every signal that was absorbed into this one, transitively, walking
   * `merged_into_signal_id` up to a bounded depth. Excludes the survivor.
   *
   * This is what makes ClickHouse reconciliation independent of the order two
   * chained merges execute in: a merge that absorbs a former survivor sweeps
   * that survivor's own absorbed ids too, so rows a not-yet-applied earlier
   * mutation would have moved are covered either way.
   */
  findAbsorbedLineage(input: {
    readonly survivorId: SignalId
    readonly maxDepth: number
  }): Effect.Effect<readonly SignalId[], RepositoryError, SqlClient>
  /**
   * Soft-deletes candidates whose last clustered score is older than
   * `idleBefore`, returning how many this call took. Promoted signals are never
   * touched.
   *
   * Platform-wide and **unscoped by organization** — the sweep behind it runs on
   * the admin client, like the escalation sweep's open-incident read. Capped so
   * one tick is one bounded statement; the next tick takes the rest.
   *
   * Safe to do bluntly because an expired candidate has no consequences to
   * unwind: nothing was announced, assigned, escalated or linked, and its scores
   * stay attached on purpose — `check-eligibility` rejects a score that already
   * carries a `signal_id`, which is what stops the sweep feeding the same
   * annotations back into discovery forever.
   */
  expireIdleCandidates(input: {
    readonly idleBefore: Date
    readonly now: Date
    readonly limit: number
  }): Effect.Effect<number, RepositoryError, SqlClient>
  /**
   * Every promoted, non-deleted signal in the project. Also the "does this
   * project have any signals at all" probe behind the list's empty state, so a
   * project holding nothing but candidates reads as empty — which is what a
   * candidate having no user-facing existence means.
   */
  list(input: ListSignalsRepositoryInput): Effect.Effect<SignalListPage, RepositoryError, SqlClient>
  listTableRows(
    input: ListSignalTableRowsRepositoryInput,
  ): Effect.Effect<SignalTableRowsPage, RepositoryError, SqlClient>
  /**
   * Ids of promoted, non-deleted signals created within the window. The
   * analytics path seeds its candidate set from ClickHouse activity metrics,
   * which never include zero-occurrence signals; feeding these ids in keeps the
   * counts, public API list, and export consistent with the table (which lists a
   * signal that fired in OR was created in the window).
   */
  listIdsCreatedInTimeRange(input: {
    readonly projectId: ProjectId
    readonly timeRange: {
      readonly from?: Date
      readonly to?: Date
    }
  }): Effect.Effect<readonly SignalId[], RepositoryError, SqlClient>
  /**
   * Signal ids whose assigned scores may enter benchmark evidence. A score's
   * non-null signal id is not enough: the signal must be promoted,
   * system-origin, non-ignored, and non-deleted.
   */
  listScoringEligibleIds(input: {
    readonly projectId: ProjectId
  }): Effect.Effect<readonly SignalId[], RepositoryError, SqlClient>
}

export class SignalRepository extends Context.Service<SignalRepository, SignalRepositoryShape>()(
  "@domain/signals/SignalRepository",
) {}
