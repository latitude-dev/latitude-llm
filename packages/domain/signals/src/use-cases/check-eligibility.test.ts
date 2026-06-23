import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
  evaluationSchema,
} from "@domain/evaluations"
import { type Score, ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { checkEligibilityUseCase } from "./check-eligibility.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const evaluationId = "eeeeeeeeeeeeeeeeeeeeeeee"

const makeEvaluation = (membershipOnPass: boolean): Evaluation =>
  evaluationSchema.parse({
    id: evaluationId,
    organizationId,
    projectId,
    signalId: "iiiiiiiiiiiiiiiiiiiiiiii",
    name: "Eval",
    description: "Detector",
    script: "const result = true",
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash"),
    alignedAt: new Date("2026-01-01T00:00:00.000Z"),
    membershipOnPass,
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  })

const createEvaluationRepository = (evaluation: Evaluation | null): EvaluationRepositoryShape => ({
  findById: (id) =>
    evaluation && id === evaluation.id
      ? Effect.succeed(evaluation)
      : Effect.fail(new NotFoundError({ entity: "Evaluation", id })),
  save: () => Effect.die("unexpected EvaluationRepository.save"),
  listByProjectId: () => Effect.die("unexpected EvaluationRepository.listByProjectId"),
  listBySignalId: () => Effect.die("unexpected EvaluationRepository.listBySignalId"),
  listBySignalIds: () => Effect.die("unexpected EvaluationRepository.listBySignalIds"),
  archive: () => Effect.die("unexpected EvaluationRepository.archive"),
  unarchive: () => Effect.die("unexpected EvaluationRepository.unarchive"),
  softDelete: () => Effect.die("unexpected EvaluationRepository.softDelete"),
  softDeleteBySignalId: () => Effect.die("unexpected EvaluationRepository.softDeleteBySignalId"),
})

const makeScore = (overrides: Partial<Score> = {}): Score =>
  scoreSchema.parse({
    id: "ssssssssssssssssssssssss",
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    simulationId: null,
    signalId: null,
    sourceType: "annotation",
    sourceId: "UI",
    value: 0.1,
    passed: false,
    feedback: "The agent gave a wrong answer",
    metadata: { rawFeedback: "The agent gave a wrong answer" },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-31T00:00:00.000Z"),
    updatedAt: new Date("2026-03-31T00:00:00.000Z"),
    ...overrides,
  })

const runEligibility = (
  score: Score | null,
  inputOverrides?: Partial<{ organizationId: string; projectId: string }>,
  evaluation: Evaluation | null = null,
) => {
  const { repository, scores } = createFakeScoreRepository()
  if (score) {
    scores.set(score.id, score)
  }

  return Effect.runPromise(
    checkEligibilityUseCase({
      organizationId: inputOverrides?.organizationId ?? organizationId,
      projectId: inputOverrides?.projectId ?? projectId,
      scoreId: score?.id ?? "missing-score-id-0000000",
    }).pipe(
      Effect.provideService(ScoreRepository, repository),
      Effect.provideService(EvaluationRepository, createEvaluationRepository(evaluation)),
    ),
  )
}

describe("checkEligibilityUseCase", () => {
  it("returns the eligible score for non-draft, failed, non-errored, unowned scores with feedback", async () => {
    const score = makeScore()
    const result = await runEligibility(score)

    expect(result).toEqual(score)
  })

  it("rejects missing scores", async () => {
    await expect(runEligibility(null)).rejects.toMatchObject({ _tag: "ScoreNotFoundForDiscoveryError" })
  })

  it("rejects drafted human-authored annotation scores", async () => {
    await expect(runEligibility(makeScore({ draftedAt: new Date("2026-03-31T01:00:00.000Z") }))).rejects.toMatchObject({
      _tag: "DraftScoreNotEligibleForDiscoveryError",
    })
  })

  it("rejects errored scores", async () => {
    await expect(runEligibility(makeScore({ error: "provider timeout", errored: true }))).rejects.toMatchObject({
      _tag: "ErroredScoreNotEligibleForDiscoveryError",
    })
  })

  it("rejects already-owned scores", async () => {
    await expect(runEligibility(makeScore({ signalId: "iiiiiiiiiiiiiiiiiiiiiiii" }))).rejects.toMatchObject({
      _tag: "ScoreAlreadyOwnedBySignalError",
    })
  })

  it("rejects scores with blank feedback", async () => {
    await expect(runEligibility(makeScore({ feedback: "   " }))).rejects.toMatchObject({
      _tag: "MissingScoreFeedbackForDiscoveryError",
    })
  })

  it("rejects passed scores", async () => {
    await expect(runEligibility(makeScore({ passed: true }))).rejects.toMatchObject({
      _tag: "PassedScoreNotEligibleForDiscoveryError",
    })
  })

  it("returns a present evaluation score under membership_on_pass=true (passed=true)", async () => {
    const evaluation = makeEvaluation(true)
    const score = makeScore({
      sourceType: "evaluation",
      sourceId: evaluation.id,
      metadata: { evaluationHash: "hash" },
      passed: true,
    })
    expect(await runEligibility(score, undefined, evaluation)).toEqual(score)
  })

  it("rejects an absent evaluation run under membership_on_pass=true (passed=false)", async () => {
    const evaluation = makeEvaluation(true)
    const score = makeScore({
      sourceType: "evaluation",
      sourceId: evaluation.id,
      metadata: { evaluationHash: "hash" },
      passed: false,
    })
    await expect(runEligibility(score, undefined, evaluation)).rejects.toMatchObject({
      _tag: "PassedScoreNotEligibleForDiscoveryError",
    })
  })

  it("returns a present evaluation score under the deprecated membership_on_pass=false (passed=false)", async () => {
    const evaluation = makeEvaluation(false)
    const score = makeScore({
      sourceType: "evaluation",
      sourceId: evaluation.id,
      metadata: { evaluationHash: "hash" },
      passed: false,
    })
    expect(await runEligibility(score, undefined, evaluation)).toEqual(score)
  })

  it("rejects an absent evaluation run under the deprecated membership_on_pass=false (passed=true)", async () => {
    const evaluation = makeEvaluation(false)
    const score = makeScore({
      sourceType: "evaluation",
      sourceId: evaluation.id,
      metadata: { evaluationHash: "hash" },
      passed: true,
    })
    await expect(runEligibility(score, undefined, evaluation)).rejects.toMatchObject({
      _tag: "PassedScoreNotEligibleForDiscoveryError",
    })
  })

  it("rejects organization mismatches", async () => {
    await expect(runEligibility(makeScore(), { organizationId: "xxxxxxxxxxxxxxxxxxxxxxxx" })).rejects.toMatchObject({
      _tag: "ScoreDiscoveryOrganizationMismatchError",
    })
  })

  it("rejects project mismatches", async () => {
    await expect(runEligibility(makeScore(), { projectId: "yyyyyyyyyyyyyyyyyyyyyyyy" })).rejects.toMatchObject({
      _tag: "ScoreDiscoveryProjectMismatchError",
    })
  })
})
