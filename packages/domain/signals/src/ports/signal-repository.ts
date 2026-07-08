import type { NotFoundError, ProjectId, RepositoryError, SignalId, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Signal } from "../entities/signal.ts"

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

export interface SignalRepositoryShape {
  findById(id: SignalId): Effect.Effect<SignalWithLifecycle, NotFoundError | RepositoryError, SqlClient>
  /**
   * Locking read used by lifecycle write paths (resolve, ignore, etc.).
   * Returns plain `Signal` — lifecycle flags would require an extra JOIN
   * that callers in this path don't need.
   */
  findByIdForUpdate(id: SignalId): Effect.Effect<Signal, NotFoundError | RepositoryError, SqlClient>
  findByIds(input: {
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
  }): Effect.Effect<readonly SignalWithLifecycle[], RepositoryError, SqlClient>
  hybridSearch(input: {
    readonly projectId: ProjectId
    readonly query: string
    readonly normalizedEmbedding: readonly number[]
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
   */
  findSimilarByCentroid(input: {
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly limit: number
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
   * Each hit carries lifecycle flags and the owning project's slug/name. Resolved/ignored issues
   * and issues in soft-deleted projects are excluded. The caller merges the two tiers (lexical
   * first) and caps the result.
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
   * Point-lookup by `(projectId, slug)`. Slugs are unique within a project,
   * so this is the natural read path for slug-keyed API endpoints.
   */
  findBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<SignalWithLifecycle, NotFoundError | RepositoryError, SqlClient>
  /** Cheap existence check for slug uniqueness paths. */
  existsBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Returns the number of non-deleted signals with this slug in the project,
   * scoped to the active organization. Powers the `exists` callback of
   * `generateSlug`; a soft-deleted signal frees its slug for reuse.
   */
  countBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
    readonly excludeSignalId?: SignalId
  }): Effect.Effect<number, RepositoryError, SqlClient>
  /** Allocates the next globally unique signal visual id (LAT-001 style). */
  allocateVisualId(): Effect.Effect<string, RepositoryError, SqlClient>
  /**
   * Point-lookup by visual id. Visual ids are globally unique so this is
   * sufficient for resolving PR mentions without a project scope.
   */
  findByVisualId(visualId: string): Effect.Effect<SignalWithLifecycle, NotFoundError | RepositoryError, SqlClient>
  save(issue: Signal): Effect.Effect<void, RepositoryError, SqlClient>
  /** Soft-delete: stamps `deleted_at` so the signal is excluded read-side and frees its slug. No-op if already deleted. */
  softDelete(id: SignalId): Effect.Effect<void, RepositoryError, SqlClient>
  list(input: ListSignalsRepositoryInput): Effect.Effect<SignalListPage, RepositoryError, SqlClient>
  listTableRows(
    input: ListSignalTableRowsRepositoryInput,
  ): Effect.Effect<SignalTableRowsPage, RepositoryError, SqlClient>
}

export class SignalRepository extends Context.Service<SignalRepository, SignalRepositoryShape>()(
  "@domain/signals/SignalRepository",
) {}
