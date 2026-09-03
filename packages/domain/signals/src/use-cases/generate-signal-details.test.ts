import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { SignalId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal, SignalScoreEvidence } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { generateSignalDetailsUseCase } from "./generate-signal-details.ts"

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"

const PLACEHOLDER_NAME = "The assistant leaks API tokens in its response"
const PLACEHOLDER_DESCRIPTION = "The assistant leaks API tokens in its response."

const makeCandidate = (): Signal => ({
  id: SignalId(signalId),
  organizationId,
  projectId,
  slug: "acme-0001",
  name: PLACEHOLDER_NAME,
  description: PLACEHOLDER_DESCRIPTION,
  source: "flagger",
  origin: "system",
  scoreEvidence: [],
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  feedback: null,
  promotedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
})

const generateDetails =
  (name: string, description: string, scoreEvidence?: SignalScoreEvidence[]): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.succeed({ object: input.schema.parse({ name, description, scoreEvidence }), tokens: 10, duration: 5 })

const occurrences = [
  { sourceType: "annotation" as const, feedback: "The assistant leaks API tokens in its response." },
  { sourceType: "annotation" as const, feedback: "Secrets appeared verbatim in the reply to the user." },
]

const run = (input: {
  readonly ignorePreviousDetails: boolean
  readonly classifyScoreEvidence?: boolean
  readonly scoreEvidence?: SignalScoreEvidence[]
  readonly occurrences?: typeof occurrences
}) => {
  const { layer: aiLayer, calls } = createFakeAI({
    generate: generateDetails(
      "Token leakage in assistant responses",
      "Secrets reach the user verbatim.",
      input.scoreEvidence,
    ),
  })
  const { repository: signalRepository } = createFakeSignalRepository([makeCandidate()])
  const { repository: scoreRepository } = createFakeScoreRepository({
    listBySignalId: () =>
      Effect.succeed({
        items: (input.occurrences ?? occurrences).map((occurrence, index) => ({
          ...makeCandidate(),
          ...occurrence,
          id: `score-${index}`,
        })) as never,
        hasMore: false,
        limit: 25,
        offset: 0,
      }),
  })

  return Effect.runPromise(
    generateSignalDetailsUseCase({
      organizationId,
      projectId,
      signalId,
      ...(input.ignorePreviousDetails ? { ignorePreviousDetails: true } : {}),
      ...(input.classifyScoreEvidence ? { classifyScoreEvidence: true } : {}),
    }).pipe(
      Effect.provide(aiLayer),
      Effect.provideService(SignalRepository, signalRepository),
      Effect.provideService(ScoreRepository, scoreRepository),
    ),
  ).then((details) => ({ details, prompt: String(calls.generate[0]?.prompt ?? "") }))
}

describe("generateSignalDetailsUseCase", () => {
  it("offers the signal's current details as the stabilization baseline", async () => {
    const { prompt } = await run({ ignorePreviousDetails: false })

    expect(prompt).toContain("Current issue details")
    expect(prompt).toContain(`Name: ${PLACEHOLDER_NAME}`)
  })

  it("withholds the baseline when asked to ignore previous details", async () => {
    // The promotion path sets this. The row still carries the placeholder built
    // from one occurrence, and offering it as "keep this when it already fits"
    // anchors the first real summary to a single member's phrasing — which is
    // the whole failure generating at promotion exists to avoid. It fails
    // silently, so this is the only thing standing between the two behaviours.
    //
    // Asserted on the baseline block's own form: the placeholder text also
    // appears in the occurrences, where it belongs, so its mere presence in the
    // prompt proves nothing either way.
    const { prompt } = await run({ ignorePreviousDetails: true })

    expect(prompt).not.toContain("Current issue details")
    expect(prompt).not.toContain(`Name: ${PLACEHOLDER_NAME}`)
    expect(prompt).toContain("Recent assigned issue occurrences")
  })

  it("returns validated evidence roles when classification is requested", async () => {
    const scoreEvidence: SignalScoreEvidence[] = [
      { scoreDimension: "outcome", role: "taskOutcome" },
      { scoreDimension: "safety", role: "confirmedHarm" },
    ]
    const { details, prompt } = await run({
      ignorePreviousDetails: true,
      classifyScoreEvidence: true,
      scoreEvidence,
    })

    expect(details.scoreEvidence).toEqual(scoreEvidence)
    expect(prompt).toContain("every supported dimension-role pair")
    expect(prompt).toContain("Reliability `operationalIncident`")
    expect(prompt).toContain("Safety `exposure`")
    expect(prompt).toContain("Do not classify a recurring defect as Safety `successfulDefense`")
  })

  it("accepts an empty diagnostic classification", async () => {
    const { details } = await run({
      ignorePreviousDetails: true,
      classifyScoreEvidence: true,
      scoreEvidence: [],
    })

    expect(details.scoreEvidence).toEqual([])
  })

  it("does not request or return classification during an ordinary refresh", async () => {
    const { details, prompt } = await run({ ignorePreviousDetails: false })

    expect(details).not.toHaveProperty("scoreEvidence")
    expect(prompt).not.toContain("Evidence roles:")
  })

  it("fails classification when no usable occurrences are available", async () => {
    await expect(
      run({
        ignorePreviousDetails: true,
        classifyScoreEvidence: true,
        occurrences: [],
      }),
    ).rejects.toMatchObject({ _tag: "MissingSignalOccurrencesForDetailsGenerationError" })
  })
})
