import { OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../ports/evaluation-repository.ts"
import { unmonitorSignalUseCase } from "./unmonitor-issue.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const signalId = SignalId("i".repeat(24))

const createEvaluationRepository = () => {
  const softDeleteCalls: Array<{ projectId: ProjectId; signalId: SignalId }> = []

  const repository: EvaluationRepositoryShape = {
    findById: () => Effect.die("Unexpected findById"),
    save: () => Effect.die("Unexpected save"),
    listByProjectId: () => Effect.die("Unexpected listByProjectId"),
    listBySignalId: () => Effect.die("Unexpected listBySignalId"),
    listBySignalIds: () => Effect.die("Unexpected listBySignalIds"),
    archive: () => Effect.die("Unexpected archive"),
    unarchive: () => Effect.die("Unexpected unarchive"),
    softDelete: () => Effect.die("Unexpected softDelete"),
    softDeleteBySignalId: (input) =>
      Effect.sync(() => {
        softDeleteCalls.push({ projectId: input.projectId, signalId: input.signalId })
      }),
  }

  return { repository, softDeleteCalls }
}

describe("unmonitorSignalUseCase", () => {
  it("soft-deletes every active evaluation linked to the issue", async () => {
    const { repository, softDeleteCalls } = createEvaluationRepository()

    await Effect.runPromise(
      unmonitorSignalUseCase({ projectId, signalId }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(EvaluationRepository, repository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(softDeleteCalls).toEqual([{ projectId, signalId }])
  })

  it("is idempotent — succeeds even when the repository deletes zero rows", async () => {
    const { repository } = createEvaluationRepository()

    await expect(
      Effect.runPromise(
        unmonitorSignalUseCase({ projectId, signalId }).pipe(
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
