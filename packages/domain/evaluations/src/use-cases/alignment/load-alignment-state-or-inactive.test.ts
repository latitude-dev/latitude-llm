import { EvaluationId, IssueId, NotFoundError, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Evaluation } from "../../entities/evaluation.ts"
import { defaultEvaluationTrigger, emptyEvaluationAlignment } from "../../entities/evaluation.ts"
import { EvaluationIssueRepository } from "../../ports/evaluation-issue-repository.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../../ports/evaluation-repository.ts"
import { loadAlignmentStateOrInactiveUseCase } from "./load-alignment-state-or-inactive.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const issueId = "i".repeat(24)
const evaluationId = "e".repeat(24)

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation =>
  ({
    id: EvaluationId(evaluationId),
    organizationId,
    projectId: ProjectId(projectId),
    issueId: IssueId(issueId),
    name: "Eval",
    description: "Desc",
    script: "return { passed: true }",
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash-1"),
    alignedAt: new Date("2026-04-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  }) as Evaluation

const makeRepositoryReturning = (evaluation: Evaluation | null): EvaluationRepositoryShape => ({
  findById: () =>
    evaluation === null
      ? Effect.fail(new NotFoundError({ entity: "Evaluation", id: evaluationId }))
      : Effect.succeed(evaluation),
  save: () => Effect.die("unused"),
  listByProjectId: () => Effect.die("unused"),
  listByIssueId: () => Effect.die("unused"),
  listByIssueIds: () => Effect.die("unused"),
  archive: () => Effect.die("unused"),
  unarchive: () => Effect.die("unused"),
  softDelete: () => Effect.die("unused"),
  softDeleteByIssueId: () => Effect.die("unused"),
})

const issueRepository = {
  findById: (id: ReturnType<typeof IssueId>) =>
    Effect.succeed({ id, projectId, name: "Issue", description: "Issue description" }),
}

const run = (repository: EvaluationRepositoryShape) =>
  Effect.runPromise(
    loadAlignmentStateOrInactiveUseCase({
      organizationId,
      projectId,
      issueId,
      evaluationId,
    }).pipe(
      Effect.provideService(EvaluationRepository, repository),
      Effect.provideService(EvaluationIssueRepository, issueRepository),
    ),
  )

describe("loadAlignmentStateOrInactiveUseCase", () => {
  it("returns active with loaded state when the evaluation is live", async () => {
    const result = await run(makeRepositoryReturning(makeEvaluation()))

    expect(result.status).toBe("active")
    if (result.status === "active") {
      expect(result.state.evaluationId).toBe(evaluationId)
    }
  })

  it("returns inactive when the evaluation is not found", async () => {
    const result = await run(makeRepositoryReturning(null))

    expect(result.status).toBe("inactive")
  })

  it("returns inactive when the evaluation is soft-deleted", async () => {
    const result = await run(makeRepositoryReturning(makeEvaluation({ deletedAt: new Date() })))

    expect(result.status).toBe("inactive")
  })

  it("returns inactive when the evaluation is archived", async () => {
    const result = await run(makeRepositoryReturning(makeEvaluation({ archivedAt: new Date() })))

    expect(result.status).toBe("inactive")
  })

  it("returns inactive when the evaluation belongs to a different project or issue", async () => {
    const result = await run(
      makeRepositoryReturning(
        makeEvaluation({
          projectId: ProjectId("x".repeat(24)),
        }),
      ),
    )

    expect(result.status).toBe("inactive")
  })
})
