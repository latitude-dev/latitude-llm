import { type Score, ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { checkEligibilityUseCase } from "./check-eligibility.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const evaluationId = "eeeeeeeeeeeeeeeeeeeeeeee"

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
    }).pipe(Effect.provideService(ScoreRepository, repository)),
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

  it("returns a present evaluation score (passed=true)", async () => {
    const score = makeScore({
      sourceType: "evaluation",
      sourceId: evaluationId,
      metadata: { evaluationHash: "hash" },
      passed: true,
    })
    expect(await runEligibility(score)).toEqual(score)
  })

  it("rejects an absent evaluation run (passed=false)", async () => {
    const score = makeScore({
      sourceType: "evaluation",
      sourceId: evaluationId,
      metadata: { evaluationHash: "hash" },
      passed: false,
    })
    await expect(runEligibility(score)).rejects.toMatchObject({
      _tag: "PassedScoreNotEligibleForDiscoveryError",
    })
  })

  // Outcome's reference judge persists a passed score for every session it
  // finds successful. Those must never open a signal, or a healthy project
  // would accumulate one "the task succeeded" signal per judged session.
  it("rejects a passed task-outcome verdict and accepts a failed one", async () => {
    const verdict = (passed: boolean) =>
      makeScore({
        passed,
        value: passed ? 1 : 0,
        sourceId: "SYSTEM",
        feedback: "The cancellation never happened.",
        metadata: {
          rawFeedback: "The cancellation never happened.",
          flaggerSlug: "task-failure",
          flaggerPath: "sampled",
          scoringArtifactVersion: "task-failure-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
          analysisHash: "a".repeat(64),
        },
      })

    await expect(runEligibility(verdict(true))).rejects.toMatchObject({
      _tag: "PassedScoreNotEligibleForDiscoveryError",
    })
    await expect(runEligibility(verdict(false))).resolves.toMatchObject({ passed: false })
  })

  // A successful defense and user-authored personal data are measurements the
  // score needs, not defects: a project whose users type their own email must
  // not accumulate one signal per session for it.
  it.each([
    { safetyFindingKind: "injectionDefense", passed: true },
    { safetyFindingKind: "piiExposure", passed: true },
    { safetyFindingKind: "injectionCompliance", passed: false },
    { safetyFindingKind: "injectionAttempt", passed: false },
    { safetyFindingKind: "piiDisclosure", passed: false },
  ])("gives $safetyFindingKind the discovery eligibility its polarity implies", async ({
    safetyFindingKind,
    passed,
  }) => {
    const finding = makeScore({
      passed,
      value: passed ? 1 : 0,
      sourceId: "SYSTEM",
      feedback: "An instruction-override attempt arrived in the first user turn.",
      metadata: {
        rawFeedback: "An instruction-override attempt arrived in the first user turn.",
        flaggerSlug: "jailbreaking",
        flaggerPath: "sampled",
        scoringArtifactVersion: "safety-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
        safetyFindingKind,
      },
    })

    if (passed) {
      await expect(runEligibility(finding)).rejects.toMatchObject({
        _tag: "PassedScoreNotEligibleForDiscoveryError",
      })
      return
    }
    await expect(runEligibility(finding)).resolves.toMatchObject({ passed: false })
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
