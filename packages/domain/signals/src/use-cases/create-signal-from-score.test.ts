import type { GenerateInput, GenerateResult } from "@domain/ai"
import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { createProject, ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import { type AnnotationScore, type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, ProjectId, ScoreId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { createSignalFromScoreUseCase } from "./create-signal-from-score.ts"

const createFakeOutboxEventWriter = () => {
  const events: OutboxWriteEvent[] = []
  const service = OutboxEventWriter.of({
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })
  return { events, service }
}

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const projectSlug = "acme-signals"

const { repository: projectRepository } = createFakeProjectRepository([
  createProject({
    id: ProjectId(projectId),
    organizationId: OrganizationId(organizationId),
    name: "Acme",
    slug: projectSlug,
  }),
])

const makeEmbedding = (): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 3
    if (index === 1) return 4
    return 0
  })

const makeScore = (overrides: Partial<AnnotationScore> = {}): AnnotationScore => ({
  id: ScoreId("ssssssssssssssssssssssss"),
  organizationId,
  projectId,
  sessionId: null,
  traceId: null,
  spanId: null,
  sourceType: "annotation",
  sourceId: "UI",
  simulationId: null,
  signalId: null,
  value: 0.2,
  passed: false,
  feedback: "The assistant leaks API tokens in its response.",
  metadata: {
    rawFeedback: "The assistant leaks API tokens in its response.",
  },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  annotatorId: null,
  createdAt: new Date("2026-03-30T10:00:00.000Z"),
  updatedAt: new Date("2026-03-30T10:00:00.000Z"),
  ...overrides,
})

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }

  return sqlClient
}

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>

/**
 * Parses inside the Effect, the way a real adapter does: a model whose answer
 * misses the schema is a failure in the error channel, not a synchronous throw.
 * Parsing eagerly would escape `catchCause` and hide the severity retry.
 */
const respondWith =
  (answer: Record<string, unknown>): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.suspend(() =>
      Effect.succeed({
        object: input.schema.parse(answer) as T,
        tokens: 10,
        duration: 5,
      }),
    )

/** A model that never returns a severity — the wider schema fails, the retry carries the signal. */
const createGenerateSignalDetails = (name: string, description: string): AIGenerate =>
  respondWith({ name, description })

const createGenerateSignalDetailsWithSeverity = (name: string, description: string, severity: string): AIGenerate =>
  respondWith({ name, description, severity })

describe("createSignalFromScoreUseCase", () => {
  it("leaves the level unset when the model answers with no usable severity", async () => {
    const { layer: aiLayer } = createFakeAI({
      generate: createGenerateSignalDetails("Token leakage", "Secrets appear in replies."),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore()
    scores.set(score.id, score)
    const outbox = createFakeOutboxEventWriter()

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ProjectRepository, projectRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, outbox.service),
      ),
    )

    // No severity is survivable: the payload simply carries none, and a payload
    // without a severity is always admitted by the notification threshold.
    expect(issues.get(result.signalId)?.priority).toBeNull()
  })

  it("writes the derived severity into the priority field at creation", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetailsWithSeverity("Token leakage", "Secrets appear in replies.", "urgent"),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore()
    scores.set(score.id, score)
    const outbox = createFakeOutboxEventWriter()

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ProjectRepository, projectRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, outbox.service),
      ),
    )

    // Committed with the signal, so the SignalCreated consumers (notifications,
    // dispatch) read a level rather than a null.
    expect(issues.get(result.signalId)?.priority).toBe("urgent")
    expect(calls.generate[0]?.prompt).toContain("`severity`")
  })

  // A detector that names the failure class outright beats the model's reading of
  // the prose — the floor raises the rating, and the tags reach the prompt.
  it("floors the level at urgent for a pii-leakage detector, whatever the model says", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetailsWithSeverity("Email addresses in replies", "Contact details echoed.", "low"),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore({
      sourceId: "SYSTEM",
      metadata: { rawFeedback: "Assistant echoed a customer email address.", flaggerSlug: "pii-leakage" },
    })
    scores.set(score.id, score)
    const outbox = createFakeOutboxEventWriter()

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ProjectRepository, projectRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, outbox.service),
      ),
    )

    expect(issues.get(result.signalId)?.priority).toBe("urgent")
    expect(calls.generate[0]?.prompt).toContain("detector=pii-leakage")
    // Annotation values are placeholders, not verdicts — no score tag for them.
    expect(calls.generate[0]?.prompt).not.toContain("score=")
  })

  // A deterministic detector already established what happened, so the model is
  // never asked to rate it — volume decides, starting at `low` for occurrence one.
  it("starts a deterministic detector's signal at low without asking for a severity", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetails("Tool call errors", "A tool keeps returning errors."),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore({
      sourceId: "SYSTEM",
      metadata: { rawFeedback: 'Tool "read_file" returned an error', flaggerSlug: "tool-call-errors" },
    })
    scores.set(score.id, score)
    const outbox = createFakeOutboxEventWriter()

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ProjectRepository, projectRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, outbox.service),
      ),
    )

    expect(issues.get(result.signalId)?.priority).toBe("low")
    // One call, not two: the severity schema is never attempted, so there is
    // nothing for the retry to fall back from.
    expect(calls.generate).toHaveLength(1)
    expect(calls.generate[0]?.prompt).not.toContain("`severity`")
  })

  it("generates details, creates a new issue, and claims score ownership", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetails(
        "Token leakage in assistant responses",
        "The assistant exposes secrets or tokens in its replies.",
      ),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore()
    scores.set(score.id, score)
    const outbox = createFakeOutboxEventWriter()

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ProjectRepository, projectRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, outbox.service),
      ),
    )

    expect(result.action).toBe("created")
    expect(result.signalId).toHaveLength(24)
    expect(scores.get(score.id)?.signalId).toBe(result.signalId)
    expect(issues.get(result.signalId)?.name).toBe("Token leakage in assistant responses")
    expect(issues.get(result.signalId)?.description).toBe("The assistant exposes secrets or tokens in its replies.")
    expect(issues.get(result.signalId)?.centroid?.mass).toBeGreaterThan(0)
    // Two calls: this model never answers with a severity, so the wider schema
    // fails and the narrow retry is what produces the name and description.
    expect(calls.generate).toHaveLength(2)

    expect(outbox.events).toHaveLength(1)
    expect(outbox.events[0]).toMatchObject({
      eventName: "SignalCreated",
      aggregateType: "issue",
      aggregateId: result.signalId,
      organizationId,
      payload: { organizationId, projectId, signalId: result.signalId },
    })
  })

  it("returns already-assigned before generation when the score already belongs to an issue", async () => {
    const { layer: aiLayer, calls } = createFakeAI()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore({
      signalId: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
    })
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ProjectRepository, projectRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, createFakeOutboxEventWriter().service),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      signalId: score.signalId,
    })
    expect(issues.size).toBe(0)
    expect(calls.generate).toHaveLength(0)
  })

  it("returns already-assigned when another worker claims the score during creation", async () => {
    const winningSignalId = SignalId("wwwwwwwwwwwwwwwwwwwwwwww")
    const { layer: aiLayer, calls } = createFakeAI({
      generate: createGenerateSignalDetails(
        "Token leakage in assistant responses",
        "The assistant exposes secrets or tokens in its replies.",
      ),
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository({
      assignSignalIfUnowned: ({ scoreId, updatedAt }) => {
        const score = scores.get(scoreId)
        if (score) {
          scores.set(scoreId, {
            ...score,
            signalId: winningSignalId,
            updatedAt,
          })
        }
        return Effect.succeed(false)
      },
    })
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    const score = makeScore()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      createSignalFromScoreUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        normalizedEmbedding: makeEmbedding(),
      }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ProjectRepository, projectRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(OutboxEventWriter, createFakeOutboxEventWriter().service),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      signalId: winningSignalId,
    })
    expect(issues.size).toBe(0)
    // Attempt plus severity retry — generation still runs once per creation attempt.
    expect(calls.generate).toHaveLength(2)
  })

  describe("issue.source mapping", () => {
    const cases = [
      {
        scoreSource: "annotation" as const,
        sourceId: "UI",
        expected: "annotation" as const,
      },
      {
        scoreSource: "annotation" as const,
        sourceId: "SYSTEM",
        expected: "flagger" as const,
      },
      {
        scoreSource: "custom" as const,
        sourceId: "api-source",
        expected: "custom" as const,
      },
    ]

    for (const { scoreSource, sourceId, expected } of cases) {
      it(`derives issue.source = "${expected}" from score.sourceType = "${scoreSource}"`, async () => {
        const { layer: aiLayer } = createFakeAI({
          generate: createGenerateSignalDetails("name", "description"),
        })
        const { repository: scoreRepository, scores } = createFakeScoreRepository()
        const { repository: signalRepository, issues } = createFakeSignalRepository()

        const baseScore = makeScore()
        const sourceScore = {
          ...baseScore,
          sourceType: scoreSource,
          sourceId,
          metadata: scoreSource === "custom" ? {} : { rawFeedback: baseScore.feedback },
        } as unknown as Score
        scores.set(sourceScore.id, sourceScore)

        const result = await Effect.runPromise(
          createSignalFromScoreUseCase({
            organizationId,
            projectId,
            scoreId: sourceScore.id,
            normalizedEmbedding: makeEmbedding(),
          }).pipe(
            Effect.provide(aiLayer),
            Effect.provideService(ScoreRepository, scoreRepository),
            Effect.provideService(SignalRepository, signalRepository),
            Effect.provideService(ProjectRepository, projectRepository),
            Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
            Effect.provideService(OutboxEventWriter, createFakeOutboxEventWriter().service),
          ),
        )

        expect(result.action).toBe("created")
        const issue = issues.get(result.signalId)
        expect(issue?.source).toBe(expected)
      })
    }
  })
})
