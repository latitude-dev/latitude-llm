import { IssueId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { IssueRepository } from "../ports/issue-repository.ts"
import { type GenerateIssueDetailsError, generateIssueDetailsUseCase } from "./generate-issue-details.ts"
import { syncIssueProjectionsUseCase } from "./sync-projections.ts"

export interface RefreshIssueDetailsInput {
  readonly organizationId: string
  readonly issueId: string
  readonly projectId: string
}

export type RefreshIssueDetailsResult =
  | {
      readonly action: "not-found"
      readonly issueId: string
    }
  | {
      readonly action: "unchanged"
      readonly issueId: string
    }
  | {
      readonly action: "updated"
      readonly issueId: string
    }

export type RefreshIssueDetailsError = RepositoryError | GenerateIssueDetailsError

export const refreshIssueDetailsUseCase = (input: RefreshIssueDetailsInput) =>
  Effect.gen(function* () {
    const generatedDetailsResult = yield* generateIssueDetailsUseCase({
      projectId: input.projectId,
      issueId: input.issueId,
    }).pipe(
      Effect.map((details) => ({ action: "ready", details }) as const),
      Effect.catchTag("IssueNotFoundForDetailsGenerationError", () => Effect.succeed({ action: "not-found" } as const)),
    )

    if (generatedDetailsResult.action === "not-found") {
      return {
        action: "not-found",
        issueId: input.issueId,
      } satisfies RefreshIssueDetailsResult
    }

    const sqlClient = yield* SqlClient

    const result = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const lockedIssueResult = yield* issueRepository.findByIdForUpdate(IssueId(input.issueId)).pipe(
          Effect.map((issue) => ({ action: "found", issue }) as const),
          Effect.catchTag("NotFoundError", () => Effect.succeed({ action: "not-found" } as const)),
        )

        if (lockedIssueResult.action === "not-found") {
          return {
            action: "not-found",
            issueId: input.issueId,
          } satisfies RefreshIssueDetailsResult
        }

        const issue = lockedIssueResult.issue

        if (
          issue.name === generatedDetailsResult.details.name &&
          issue.description === generatedDetailsResult.details.description
        ) {
          return {
            action: "unchanged",
            issueId: issue.id,
          } satisfies RefreshIssueDetailsResult
        }

        yield* issueRepository.save({
          ...issue,
          name: generatedDetailsResult.details.name,
          description: generatedDetailsResult.details.description,
          updatedAt: new Date(),
        })

        return {
          action: "updated",
          issueId: issue.id,
        } satisfies RefreshIssueDetailsResult
      }),
    )

    if (result.action === "updated") {
      yield* syncIssueProjectionsUseCase({
        organizationId: input.organizationId,
        issueId: result.issueId,
      })
    }

    return result
  }) as Effect.Effect<RefreshIssueDetailsResult, RefreshIssueDetailsError>
