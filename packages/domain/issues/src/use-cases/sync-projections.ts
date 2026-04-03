import { IssueId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { normalizeIssueCentroid } from "../helpers.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

export interface SyncIssueProjectionsInput {
  readonly organizationId: string
  readonly issueId: string
}

export const syncIssueProjectionsUseCase = (input: SyncIssueProjectionsInput) =>
  Effect.gen(function* () {
    const issueProjectionRepository = yield* IssueProjectionRepository
    const issueRepository = yield* IssueRepository

    const issue = yield* issueRepository
      .findById(IssueId(input.issueId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (!issue) {
      return
    }

    const vector = normalizeIssueCentroid(issue.centroid)
    if (vector.length === 0) {
      yield* issueProjectionRepository.delete({
        organizationId: issue.organizationId,
        projectId: issue.projectId,
        uuid: issue.uuid,
      })
      return
    }

    yield* issueProjectionRepository.upsert({
      organizationId: issue.organizationId,
      projectId: issue.projectId,
      uuid: issue.uuid,
      title: issue.name,
      description: issue.description,
      vector,
    })
  }) as Effect.Effect<void, RepositoryError>
