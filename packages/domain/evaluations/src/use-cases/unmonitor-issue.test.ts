import { IssueId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../ports/evaluation-repository.ts"
import { unmonitorIssueUseCase } from "./unmonitor-issue.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const issueId = IssueId("i".repeat(24))

const createEvaluationRepository = () => {
  const softDeleteCalls: Array<{ projectId: ProjectId; issueId: IssueId }> = []

  const repository: EvaluationRepositoryShape = {
    findById: () => Effect.die("Unexpected findById"),
    save: () => Effect.die("Unexpected save"),
    listByProjectId: () => Effect.die("Unexpected listByProjectId"),
    listByIssueId: () => Effect.die("Unexpected listByIssueId"),
    listByIssueIds: () => Effect.die("Unexpected listByIssueIds"),
    archive: () => Effect.die("Unexpected archive"),
    unarchive: () => Effect.die("Unexpected unarchive"),
    softDelete: () => Effect.die("Unexpected softDelete"),
    softDeleteByIssueId: (input) =>
      Effect.sync(() => {
        softDeleteCalls.push({ projectId: input.projectId, issueId: input.issueId })
      }),
  }

  return { repository, softDeleteCalls }
}

describe("unmonitorIssueUseCase", () => {
  it("soft-deletes every active evaluation linked to the issue", async () => {
    const { repository, softDeleteCalls } = createEvaluationRepository()

    await Effect.runPromise(
      unmonitorIssueUseCase({ projectId, issueId }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(EvaluationRepository, repository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(softDeleteCalls).toEqual([{ projectId, issueId }])
  })

  it("is idempotent — succeeds even when the repository deletes zero rows", async () => {
    const { repository } = createEvaluationRepository()

    await expect(
      Effect.runPromise(
        unmonitorIssueUseCase({ projectId, issueId }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(EvaluationRepository, repository),
              Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            ),
          ),
        ),
      ),
    ).resolves.toBeUndefined()
  })
})
