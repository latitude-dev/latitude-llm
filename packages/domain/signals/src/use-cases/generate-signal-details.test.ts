import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { ProjectId, SignalId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { SIGNAL_DETAILS_DEFAULT_GENERATION_MODEL, SIGNAL_DETAILS_MAX_OCCURRENCES } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { generateSignalDetailsUseCase } from "./generate-signal-details.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Current issue title",
  description: "Current issue description",
  source: "annotation",
  origin: "system",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-31T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-31T10:00:00.000Z"),
  updatedAt: new Date("2026-03-31T10:00:00.000Z"),
  ...overrides,
})

const makeScore = (feedback: string) =>
  scoreSchema.parse({
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    sourceType: "annotation",
    sourceId: "UI",
    simulationId: null,
    signalId: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
    value: 0.1,
    passed: false,
    feedback,
    metadata: { rawFeedback: feedback },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-31T10:00:00.000Z"),
    updatedAt: new Date("2026-03-31T10:00:00.000Z"),
  })

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>

const createGenerateSignalDetails =
  (name: string, description: string): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.succeed({
      object: input.schema.parse({
        name,
        description,
      }),
      tokens: 10,
      duration: 5,
    })

describe("generateSignalDetailsUseCase", () => {
  it("generates initial issue details from explicit occurrences", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetails(
        "  Token leakage in assistant responses  ",
        "  The assistant exposes API tokens or secrets in replies.  ",
      ),
    })
    const { repository: signalRepository } = createFakeSignalRepository()
    const { repository: scoreRepository } = createFakeScoreRepository()

    const result = await Effect.runPromise(
      generateSignalDetailsUseCase({
        organizationId,
        projectId,
        occurrences: [
          {
            sourceType: "annotation",
            feedback: "The assistant leaked a production API key in the reply.",
          },
        ],
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
      ),
    )

    expect(result).toEqual({
      name: "Token leakage in assistant responses",
      description: "The assistant exposes API tokens or secrets in replies.",
    })
    expect(calls.generate).toHaveLength(1)
    expect(calls.generate[0]?.provider).toBe(SIGNAL_DETAILS_DEFAULT_GENERATION_MODEL.provider)
    expect(calls.generate[0]?.model).toBe(SIGNAL_DETAILS_DEFAULT_GENERATION_MODEL.model)
    expect(calls.generate[0]?.prompt).toContain("The assistant leaked a production API key in the reply.")
  })

  it("loads the last 25 assigned occurrences and baseline details for an existing issue", async () => {
    const existingSignal = makeSignal()
    const listBySignalCalls: unknown[] = []
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetails("Stable issue title", "Stable issue description"),
    })
    const { repository: signalRepository } = createFakeSignalRepository([existingSignal])
    const { repository: scoreRepository } = createFakeScoreRepository({
      listBySignalId: (input) => {
        listBySignalCalls.push(input)
        return Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: input.options?.limit ?? 50,
          offset: input.options?.offset ?? 0,
        })
      },
    })

    const result = await Effect.runPromise(
      generateSignalDetailsUseCase({
        organizationId,
        projectId,
        signalId: existingSignal.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
      ),
    )

    expect(result).toEqual({
      name: "Stable issue title",
      description: "Stable issue description",
    })
    expect(listBySignalCalls).toEqual([
      {
        projectId: ProjectId(projectId),
        signalId: existingSignal.id,
        options: {
          limit: SIGNAL_DETAILS_MAX_OCCURRENCES,
        },
      },
    ])
    expect(calls.generate[0]?.prompt).toContain("Current issue title")
    expect(calls.generate[0]?.prompt).toContain("Current issue description")
    expect(calls.generate[0]?.prompt).toContain("The assistant leaks access tokens in tool output.")
  })

  it("returns existing details unchanged when an issue has no assigned occurrences left", async () => {
    const existingSignal = makeSignal()
    const { layer: aiLayer, calls } = createFakeAI()
    const { repository: signalRepository } = createFakeSignalRepository([existingSignal])
    const { repository: scoreRepository } = createFakeScoreRepository({
      listBySignalId: () =>
        Effect.succeed({
          items: [],
          hasMore: false,
          limit: SIGNAL_DETAILS_MAX_OCCURRENCES,
          offset: 0,
        }),
    })

    const result = await Effect.runPromise(
      generateSignalDetailsUseCase({
        organizationId,
        projectId,
        signalId: existingSignal.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
      ),
    )

    expect(result).toEqual({
      name: existingSignal.name,
      description: existingSignal.description,
    })
    expect(calls.generate).toHaveLength(0)
  })
})
