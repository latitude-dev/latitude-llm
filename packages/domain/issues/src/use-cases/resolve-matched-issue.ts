import { ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { IssueRepository } from "../ports/issue-repository.ts"

export interface ResolveMatchedIssueInput {
  readonly organizationId: string
  readonly projectId: string
  readonly matchedIssueUuid: string | null
}

export interface ResolvedIssueMatch {
  readonly issueId: string | null
}

export const resolveMatchedIssueUseCase = (input: ResolveMatchedIssueInput) =>
  Effect.gen(function* () {
    if (input.matchedIssueUuid === null) {
      return {
        issueId: null,
      } satisfies ResolvedIssueMatch
    }

    const issueRepository = yield* IssueRepository
    const issue = yield* issueRepository
      .findByUuid({
        projectId: ProjectId(input.projectId),
        uuid: input.matchedIssueUuid,
      })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    return {
      issueId: issue?.id ?? null,
    } satisfies ResolvedIssueMatch
  }) as Effect.Effect<ResolvedIssueMatch, RepositoryError>
