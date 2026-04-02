import type { IssueId, ProjectId, RepositoryError } from "@domain/shared"
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
  findById(id: IssueId): Effect.Effect<Issue | null, RepositoryError>
  findByIdForUpdate(id: IssueId): Effect.Effect<Issue | null, RepositoryError>
  findByUuid(input: {
    readonly projectId: ProjectId
    readonly uuid: string
  }): Effect.Effect<Issue | null, RepositoryError>
  save(issue: Issue): Effect.Effect<void, RepositoryError>
  list(input: ListIssuesRepositoryInput): Effect.Effect<IssueListPage, RepositoryError>
}

export class IssueRepository extends ServiceMap.Service<IssueRepository, IssueRepositoryShape>()(
  "@domain/issues/IssueRepository",
) {}
