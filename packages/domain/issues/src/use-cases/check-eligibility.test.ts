import { type Score, ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { FlaggerId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { checkEligibilityUseCase } from "./check-eligibility.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeScore = (overrides: Partial<Score> = {}): Score =>
  scoreSchema.parse({
    id: "ssssssssssssssssssssssss",
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    simulationId: null,
    issueId: null,
    source: "annotation",
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

  it("admits drafted flagger-authored scores", async () => {
    const flaggerDraft = makeScore({
      source: "flagger",
      sourceId: FlaggerId("ffffffffffffffffffffffff"),
      metadata: { rawFeedback: "Refusal-style behavior detected" },
      draftedAt: new Date("2026-03-31T01:00:00.000Z"),
    })
    const result = await runEligibility(flaggerDraft)
    expect(result).toEqual(flaggerDraft)
  })

  it("rejects errored scores", async () => {
    await expect(runEligibility(makeScore({ error: "provider timeout", errored: true }))).rejects.toMatchObject({
      _tag: "ErroredScoreNotEligibleForDiscoveryError",
    })
  })

  it("rejects already-owned scores", async () => {
    await expect(runEligibility(makeScore({ issueId: "iiiiiiiiiiiiiiiiiiiiiiii" }))).rejects.toMatchObject({
      _tag: "ScoreAlreadyOwnedByIssueError",
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
