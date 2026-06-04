import type { IssueId, NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Issue } from "../entities/issue.ts"

/**
 * Lifecycle flags derived from `alert_incidents` rows joined onto an issue
 * read. These are the stored truth for "is this issue currently escalating /
 * regressed" — see `deriveIssueLifecycleStates`.
 */
export interface IssueLifecycleFlags {
  readonly isEscalating: boolean
  readonly isRegressed: boolean
}

/**
 * Issue payload returned by read methods that JOIN `alert_incidents`. The
 * lifecycle flags are attached as an extra property so existing consumers
 * that just read `Issue` columns (e.g. `issue.name`, `issue.projectId`)
 * keep working without changes.
 */
export type IssueWithLifecycle = Issue & { readonly lifecycle: IssueLifecycleFlags }

export interface IssueListPage {
  readonly items: readonly IssueWithLifecycle[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface IssueSearchCandidate {
  readonly issueId: IssueId
  readonly name: string
  readonly description: string
  readonly score: number
}

/**
 * One org-wide search hit for the Command Palette: the matched issue (with lifecycle flags so the
 * caller can derive its states without a second read) plus its owning project's slug/name and the
 * relevance score of whichever tier produced it.
 */
export interface OrgIssueSearchHit {
  readonly issue: IssueWithLifecycle
  readonly projectSlug: string
  readonly projectName: string
  readonly score: number
}

export interface ListIssuesRepositoryInput {
  readonly projectId: ProjectId
  readonly limit: number
  readonly offset: number
}

export interface IssueRepositoryShape {
  findById(id: IssueId): Effect.Effect<IssueWithLifecycle, NotFoundError | RepositoryError, SqlClient>
  /**
   * Locking read used by lifecycle write paths (resolve, ignore, etc.).
   * Returns plain `Issue` — lifecycle flags would require an extra JOIN
   * that callers in this path don't need.
   */
  findByIdForUpdate(id: IssueId): Effect.Effect<Issue, NotFoundError | RepositoryError, SqlClient>
  findByIds(input: {
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
  }): Effect.Effect<readonly IssueWithLifecycle[], RepositoryError, SqlClient>
  hybridSearch(input: {
    readonly projectId: ProjectId
    readonly query: string
    readonly normalizedEmbedding: readonly number[]
  }): Effect.Effect<readonly IssueSearchCandidate[], RepositoryError, SqlClient>
  /**
   * Org-wide issue search across every project in the organization (RLS-scoped to the caller's
   * org), powering the Command Palette. Two tiers selected by `normalizedEmbedding`:
   *
   * - **Lexical** (no embedding): full-text match on the issue's search document OR a
   *   case-insensitive substring match on its name. Instant and index-backed (GIN).
   * - **Semantic** (embedding present): the hybrid vector + lexical relevance blend, surfacing
   *   related issues whose names don't literally contain the query.
   *
   * Each hit carries lifecycle flags and the owning project's slug/name. Issues in soft-deleted
   * projects are excluded. The caller merges the two tiers (lexical first) and caps the result.
   * When `preferProjectId` is set, that project's issues rank first *within each tier* (so a
   * current-project lexical hit still beats an other-project semantic hit) — the palette passes the
   * current project so local results lead.
   */
  searchOrgWide(input: {
    readonly query: string
    readonly normalizedEmbedding?: readonly number[]
    readonly preferProjectId?: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly OrgIssueSearchHit[], RepositoryError, SqlClient>
  /**
   * Point-lookup by `(projectId, slug)`. Slugs are unique within a project,
   * so this is the natural read path for slug-keyed API endpoints.
   */
  findBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<IssueWithLifecycle, NotFoundError | RepositoryError, SqlClient>
  /** Cheap existence check for slug uniqueness paths. */
  existsBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Returns the number of non-deleted issues with this slug in the project,
   * scoped to the active organization (issues aren't soft-deleted, so this
   * is a simple COUNT). Powers the `exists` callback of `generateSlug`.
   */
  countBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
    readonly excludeIssueId?: IssueId
  }): Effect.Effect<number, RepositoryError, SqlClient>
  save(issue: Issue): Effect.Effect<void, RepositoryError, SqlClient>
  list(input: ListIssuesRepositoryInput): Effect.Effect<IssueListPage, RepositoryError, SqlClient>
}

export class IssueRepository extends Context.Service<IssueRepository, IssueRepositoryShape>()(
  "@domain/issues/IssueRepository",
) {}
