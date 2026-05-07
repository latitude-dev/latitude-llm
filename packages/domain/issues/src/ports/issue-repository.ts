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
  findByUuid(input: {
    readonly projectId: ProjectId
    readonly uuid: string
  }): Effect.Effect<IssueWithLifecycle, NotFoundError | RepositoryError, SqlClient>
  save(issue: Issue): Effect.Effect<void, RepositoryError, SqlClient>
  list(input: ListIssuesRepositoryInput): Effect.Effect<IssueListPage, RepositoryError, SqlClient>
}

export class IssueRepository extends Context.Service<IssueRepository, IssueRepositoryShape>()(
  "@domain/issues/IssueRepository",
) {}
