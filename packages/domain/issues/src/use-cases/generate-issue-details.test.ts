import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { IssueId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ISSUE_DETAILS_GENERATION_MODEL, ISSUE_DETAILS_MAX_OCCURRENCES } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { generateIssueDetailsUseCase } from "./generate-issue-details.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Current issue title",
  description: "Current issue description",
  centroid: createIssueCentroid(),
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
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    issueId: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
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

const createGenerateIssueDetails =
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

describe("generateIssueDetailsUseCase", () => {
  it("generates initial issue details from explicit occurrences", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateIssueDetails(
        "  Token leakage in assistant responses  ",
        "  The assistant exposes API tokens or secrets in replies.  ",
      ),
    })
    const { repository: issueRepository } = createFakeIssueRepository()
    const { repository: scoreRepository } = createFakeScoreRepository()

    const result = await Effect.runPromise(
      generateIssueDetailsUseCase({
        projectId,
        occurrences: [
          {
            source: "annotation",
            feedback: "The assistant leaked a production API key in the reply.",
          },
        ],
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
      ),
    )

    expect(result).toEqual({
      name: "Token leakage in assistant responses",
      description: "The assistant exposes API tokens or secrets in replies.",
    })
    expect(calls.generate).toHaveLength(1)
    expect(calls.generate[0]?.provider).toBe(ISSUE_DETAILS_GENERATION_MODEL.provider)
    expect(calls.generate[0]?.model).toBe(ISSUE_DETAILS_GENERATION_MODEL.model)
    expect(calls.generate[0]?.prompt).toContain("The assistant leaked a production API key in the reply.")
  })

  it("loads the last 25 assigned occurrences and baseline details for an existing issue", async () => {
    const existingIssue = makeIssue()
    const listByIssueCalls: unknown[] = []
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateIssueDetails("Stable issue title", "Stable issue description"),
    })
    const { repository: issueRepository } = createFakeIssueRepository([existingIssue])
    const { repository: scoreRepository } = createFakeScoreRepository({
      listByIssueId: (input) => {
        listByIssueCalls.push(input)
        return Effect.succeed({
          items: [makeScore("The assistant leaks access tokens in tool output.")],
          hasMore: false,
          limit: input.options?.limit ?? 50,
          offset: input.options?.offset ?? 0,
        })
      },
    })

    const result = await Effect.runPromise(
      generateIssueDetailsUseCase({
        projectId,
        issueId: existingIssue.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
      ),
    )

    expect(result).toEqual({
      name: "Stable issue title",
      description: "Stable issue description",
    })
    expect(listByIssueCalls).toEqual([
      {
        projectId: ProjectId(projectId),
        issueId: existingIssue.id,
        options: {
          limit: ISSUE_DETAILS_MAX_OCCURRENCES,
        },
      },
    ])
    expect(calls.generate[0]?.prompt).toContain("Current issue title")
    expect(calls.generate[0]?.prompt).toContain("Current issue description")
    expect(calls.generate[0]?.prompt).toContain("The assistant leaks access tokens in tool output.")
  })

  it("returns existing details unchanged when an issue has no assigned occurrences left", async () => {
    const existingIssue = makeIssue()
    const { layer: aiLayer, calls } = createFakeAI()
    const { repository: issueRepository } = createFakeIssueRepository([existingIssue])
    const { repository: scoreRepository } = createFakeScoreRepository({
      listByIssueId: () =>
        Effect.succeed({
          items: [],
          hasMore: false,
          limit: ISSUE_DETAILS_MAX_OCCURRENCES,
          offset: 0,
        }),
    })

    const result = await Effect.runPromise(
      generateIssueDetailsUseCase({
        projectId,
        issueId: existingIssue.id,
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreRepository, scoreRepository),
      ),
    )

    expect(result).toEqual({
      name: existingIssue.name,
      description: existingIssue.description,
    })
    expect(calls.generate).toHaveLength(0)
  })
})
