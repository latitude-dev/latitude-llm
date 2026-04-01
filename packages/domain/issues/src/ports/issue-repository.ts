import type { IssueId, ProjectId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Issue } from "../entities/issue.ts"

export interface IssueRepositoryShape {
  findById(id: IssueId): Effect.Effect<Issue | null, RepositoryError>
  findByUuid(input: {
    readonly projectId: ProjectId
    readonly uuid: string
  }): Effect.Effect<Issue | null, RepositoryError>
  save(issue: Issue): Effect.Effect<void, RepositoryError>
}

export class IssueRepository extends ServiceMap.Service<IssueRepository, IssueRepositoryShape>()(
  "@domain/issues/IssueRepository",
) {}
