import { hashOptimizationCandidateText } from "@domain/optimizations"
import { EvaluationId, NotFoundError, OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { compileSettingsToScript } from "../../codegen/compile-settings-to-script.ts"
import { EVALUATION_CONVERSATION_PLACEHOLDER, wrapPromptAsEvaluationScript } from "../../codegen/judge-script-template.ts"
import type { Evaluation } from "../../entities/evaluation.ts"
import { defaultEvaluationTrigger, emptyEvaluationAlignment } from "../../entities/evaluation.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../../ports/evaluation-repository.ts"
import { EvaluationSignalRepository } from "../../ports/evaluation-signal-repository.ts"
import { loadAlignmentStateOrInactiveUseCase } from "./load-alignment-state-or-inactive.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const signalId = "i".repeat(24)
const evaluationId = "e".repeat(24)

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation =>
  ({
    id: EvaluationId(evaluationId),
    organizationId,
    projectId: ProjectId(projectId),
    signalId: SignalId(signalId),
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
  listBySignalId: () => Effect.die("unused"),
  listBySignalIds: () => Effect.die("unused"),
  archive: () => Effect.die("unused"),
  unarchive: () => Effect.die("unused"),
  softDelete: () => Effect.die("unused"),
  softDeleteBySignalId: () => Effect.die("unused"),
})

const signalRepository = {
  findById: (id: ReturnType<typeof SignalId>) =>
    Effect.succeed({
      id,
      projectId,
      name: "Signal",
      description: "Signal description",
      resolvedAt: null,
      ignoredAt: null,
    }),
  claimReopenOnOccurrence: () => Effect.succeed(false),
}

const run = (repository: EvaluationRepositoryShape) =>
  Effect.runPromise(
    loadAlignmentStateOrInactiveUseCase({
      organizationId,
      projectId,
      signalId,
      evaluationId,
    }).pipe(
      Effect.provideService(EvaluationRepository, repository),
      Effect.provideService(EvaluationSignalRepository, signalRepository),
      Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
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

  it("marks incrementalEligible=true and exposes the computed hash when script matches the persisted hash", async () => {
    const script = "return { passed: true, feedback: 'ok' }"
    const hash = await hashOptimizationCandidateText(script)
    const result = await run(
      makeRepositoryReturning(
        makeEvaluation({
          script,
          alignment: emptyEvaluationAlignment(hash),
        }),
      ),
    )

    expect(result.status).toBe("active")
    if (result.status === "active") {
      expect(result.incrementalEligible).toBe(true)
      expect(result.currentScriptHash).toBe(hash)
    }
  })

  it("recompiles from settings for alignment, so a stale stored script cannot stay incremental-eligible", async () => {
    const settings = { kind: "judge", criteria: "Check for secret leakage in the conversation." } as const
    const legacyPlaceholder = ["${", "conversation}"].join("")
    const staleScript = wrapPromptAsEvaluationScript(
      ["Check for secret leakage in the conversation.", legacyPlaceholder].join("\n"),
    )
    const staleHash = await hashOptimizationCandidateText(staleScript)
    const resolvedScript = compileSettingsToScript(settings)
    const result = await run(
      makeRepositoryReturning(
        makeEvaluation({
          script: staleScript,
          settings,
          alignment: emptyEvaluationAlignment(staleHash),
        }),
      ),
    )

    expect(result.status).toBe("active")
    if (result.status === "active") {
      expect(result.state.draft.script).toBe(resolvedScript)
      expect(result.state.draft.script).toContain(EVALUATION_CONVERSATION_PLACEHOLDER)
      expect(result.incrementalEligible).toBe(false)
      expect(result.currentScriptHash).toBe(await hashOptimizationCandidateText(resolvedScript))
      expect(result.currentScriptHash).not.toBe(staleHash)
    }
  })

  it("marks incrementalEligible=false when sha1(script) diverges from the persisted hash", async () => {
    const script = "return { passed: true }"
    const result = await run(
      makeRepositoryReturning(
        makeEvaluation({
          script,
          alignment: emptyEvaluationAlignment("stale-hash-from-a-previous-script"),
        }),
      ),
    )

    expect(result.status).toBe("active")
    if (result.status === "active") {
      expect(result.incrementalEligible).toBe(false)
      expect(result.currentScriptHash).toBe(await hashOptimizationCandidateText(script))
      expect(result.currentScriptHash).not.toBe("stale-hash-from-a-previous-script")
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
