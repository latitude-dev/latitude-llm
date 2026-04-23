import type { IssueId, NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Issue } from "../entities/issue.ts"

export interface IssueListPage {
  readonly items: readonly Issue[]
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
  findById(id: IssueId): Effect.Effect<Issue, NotFoundError | RepositoryError, SqlClient>
  findByIdForUpdate(id: IssueId): Effect.Effect<Issue, NotFoundError | RepositoryError, SqlClient>
  findByIds(input: {
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
  }): Effect.Effect<readonly Issue[], RepositoryError, SqlClient>
  findByUuid(input: {
    readonly projectId: ProjectId
    readonly uuid: string
  }): Effect.Effect<Issue, NotFoundError | RepositoryError, SqlClient>
  save(issue: Issue): Effect.Effect<void, RepositoryError, SqlClient>
  list(input: ListIssuesRepositoryInput): Effect.Effect<IssueListPage, RepositoryError, SqlClient>
}

export class IssueRepository extends ServiceMap.Service<IssueRepository, IssueRepositoryShape>()(
  "@domain/issues/IssueRepository",
) {}
