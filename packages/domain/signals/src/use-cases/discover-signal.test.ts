import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { OutboxEventWriter } from "@domain/events"
import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { type Score, ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  ChSqlClient,
  EvaluationId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  ScoreId,
  SignalId,
  SqlClient,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/index.ts"
import { discoverSignalUseCase } from "./discover-signal.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"

const makeEmbedding = (): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 0.6
    if (index === 1) return 0.8
    return 0
  })

const makeScore = (overrides: Partial<Score> = {}): Score =>
  ({
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
    passed: true,
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
    createdAt: new Date("2026-03-30T10:00:00.000Z"),
    updatedAt: new Date("2026-03-30T10:00:00.000Z"),
    ...overrides,
  }) as Score

const makeSignal = (overrides?: Partial<Signal>): Signal => ({
  id: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  source: "annotation",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-29T10:00:00.000Z"),
  updatedAt: new Date("2026-03-29T10:00:00.000Z"),
  ...overrides,
})

const makeEvaluation = (signalId: string, overrides: Partial<Evaluation> = {}): Evaluation =>
  ({
    id: EvaluationId("eeeeeeeeeeeeeeeeeeeeeeee"),
    organizationId,
    projectId: ProjectId(projectId),
    signalId: SignalId(signalId),
    name: "Token leakage evaluation",
    description: "Flags token leakage",
    script: "return { passed: false }",
    legacyPolarity: false,
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("abc123"),
    alignedAt: new Date("2026-03-29T08:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-03-29T08:00:00.000Z"),
    updatedAt: new Date("2026-03-29T08:00:00.000Z"),
    ...overrides,
  }) as Evaluation

const createPassthroughSqlClient = (id: string) =>
  Layer.succeed(SqlClient, {
    organizationId: OrganizationId(id),
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  })

const createPassthroughChSqlClient = (id: string) =>
  Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(id) }))

const createWorkflowStarter = () => {
  const startedWorkflows: Array<{
    readonly workflow: string
    readonly input: unknown
    readonly options: { readonly workflowId: string }
  }> = []
  const workflowStarter: WorkflowStarterShape = {
    start: (workflow, input, options) =>
      Effect.sync(() => {
        startedWorkflows.push({ workflow, input, options })
      }),
    signalWithStart: () => Effect.die("signalWithStart should not be called in discoverSignalUseCase tests"),
  }

  return { workflowStarter, startedWorkflows }
}

const createEvaluationRepository = (findById: EvaluationRepositoryShape["findById"]): EvaluationRepositoryShape => ({
  findById,
  save: () => Effect.die("Unexpected EvaluationRepository.save in unit test"),
  listByProjectId: () => Effect.die("Unexpected EvaluationRepository.listByProjectId in unit test"),
  listBySignalId: () => Effect.die("Unexpected EvaluationRepository.listBySignalId in unit test"),
  listBySignalIds: () => Effect.die("Unexpected EvaluationRepository.listBySignalIds in unit test"),
  archive: () => Effect.die("Unexpected EvaluationRepository.archive in unit test"),
  unarchive: () => Effect.die("Unexpected EvaluationRepository.unarchive in unit test"),
  softDelete: () => Effect.die("Unexpected EvaluationRepository.softDelete in unit test"),
  softDeleteBySignalId: () => Effect.die("Unexpected EvaluationRepository.softDeleteBySignalId in unit test"),
})

describe("discoverSignalUseCase", () => {
  it("assigns a published annotation directly when a preselected issue is provided", async () => {
    const existingSignal = makeSignal()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository([existingSignal])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const score = makeScore()
    const writtenEvents: unknown[] = []
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      discoverSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: existingSignal.id,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" }))),
        ),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
        Effect.provide(createPassthroughChSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      workflow: "assignScoreToKnownSignalWorkflow",
      scoreId: score.id,
    })
    expect(scores.get(score.id)?.signalId).toBeNull()
    expect(issues.get(existingSignal.id)?.centroid.mass).toBe(0)
    expect(inserted).toHaveLength(0)
    expect(fakeAi.calls.embed).toHaveLength(0)
    expect(startedWorkflows).toEqual([
      {
        workflow: "assignScoreToKnownSignalWorkflow",
        input: {
          organizationId,
          projectId,
          scoreId: score.id,
          signalId: existingSignal.id,
        },
        options: {
          workflowId: `issues:assign-known:${score.id}`,
        },
      },
    ])
    expect(writtenEvents).toHaveLength(0)
  })

  it("uses the linked evaluation issue before starting the full workflow", async () => {
    const existingSignal = makeSignal()
    const linkedEvaluation = makeEvaluation(existingSignal.id)
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository } = createFakeSignalRepository([existingSignal])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    scores.set(
      ScoreId("tttttttttttttttttttttttt"),
      makeScore({
        id: ScoreId("tttttttttttttttttttttttt"),
        sourceType: "evaluation",
        sourceId: linkedEvaluation.id,
        metadata: {
          evaluationHash: "eval-hash-v1",
        },
      }),
    )

    const result = await Effect.runPromise(
      discoverSignalUseCase({
        organizationId,
        projectId,
        scoreId: ScoreId("tttttttttttttttttttttttt"),
        signalId: null,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository((id) =>
            id === linkedEvaluation.id
              ? Effect.succeed(linkedEvaluation)
              : Effect.fail(new NotFoundError({ entity: "Evaluation", id })),
          ),
        ),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
        Effect.provide(createPassthroughChSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      workflow: "assignScoreToKnownSignalWorkflow",
      scoreId: ScoreId("tttttttttttttttttttttttt"),
    })
    expect(inserted).toHaveLength(0)
    expect(fakeAi.calls.embed).toHaveLength(0)
    expect(startedWorkflows).toEqual([
      {
        workflow: "assignScoreToKnownSignalWorkflow",
        input: {
          organizationId,
          projectId,
          scoreId: ScoreId("tttttttttttttttttttttttt"),
          signalId: existingSignal.id,
        },
        options: {
          workflowId: "issues:assign-known:tttttttttttttttttttttttt",
        },
      },
    ])
  })

  it("starts the discovery workflow when no selected or linked issue is available", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository } = createFakeSignalRepository()
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const score = makeScore()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      discoverSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: null,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" }))),
        ),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
        Effect.provide(createPassthroughChSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      workflow: "signalDiscoveryWorkflow",
      scoreId: score.id,
    })
    expect(inserted).toHaveLength(0)
    expect(startedWorkflows).toEqual([
      {
        workflow: "signalDiscoveryWorkflow",
        input: {
          organizationId,
          projectId,
          scoreId: score.id,
        },
        options: {
          workflowId: `issues:discovery:${score.id}`,
        },
      },
    ])
  })

  it("falls back to the workflow when the selected issue belongs to another project", async () => {
    const foreignSignal = makeSignal({
      id: SignalId("jjjjjjjjjjjjjjjjjjjjjjjj"),
      projectId: otherProjectId,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository([foreignSignal])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const score = makeScore()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      discoverSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: foreignSignal.id,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" }))),
        ),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
        Effect.provide(createPassthroughChSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      workflow: "signalDiscoveryWorkflow",
      scoreId: score.id,
    })
    expect(scores.get(score.id)?.signalId).toBeNull()
    expect(issues.get(foreignSignal.id)?.centroid.mass).toBe(0)
    expect(inserted).toHaveLength(0)
    expect(startedWorkflows).toHaveLength(1)
  })

  it("falls back to the workflow when the linked evaluation belongs to another project", async () => {
    const foreignSignal = makeSignal({
      id: SignalId("kkkkkkkkkkkkkkkkkkkkkkkk"),
      projectId: otherProjectId,
    })
    const foreignEvaluation = makeEvaluation(foreignSignal.id, {
      id: EvaluationId("ffffffffffffffffffffffff"),
      projectId: ProjectId(otherProjectId),
      signalId: foreignSignal.id,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository, issues } = createFakeSignalRepository([foreignSignal])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const score = makeScore({
      id: ScoreId("vvvvvvvvvvvvvvvvvvvvvvvv"),
      sourceType: "evaluation",
      sourceId: foreignEvaluation.id,
      metadata: {
        evaluationHash: "eval-hash-v2",
      },
    })
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      discoverSignalUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        signalId: null,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository((id) =>
            id === foreignEvaluation.id
              ? Effect.succeed(foreignEvaluation)
              : Effect.fail(new NotFoundError({ entity: "Evaluation", id })),
          ),
        ),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
        Effect.provide(createPassthroughChSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      workflow: "signalDiscoveryWorkflow",
      scoreId: score.id,
    })
    expect(scores.get(score.id)?.signalId).toBeNull()
    expect(issues.get(foreignSignal.id)?.centroid.mass).toBe(0)
    expect(inserted).toHaveLength(0)
    expect(startedWorkflows).toHaveLength(1)
  })

  it("replays analytics sync when the score was already assigned before retry", async () => {
    const existingSignal = makeSignal()
    const assignedScore = makeScore({
      signalId: existingSignal.id,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository } = createFakeSignalRepository([existingSignal])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    scores.set(assignedScore.id, assignedScore)

    const result = await Effect.runPromise(
      discoverSignalUseCase({
        organizationId,
        projectId,
        scoreId: assignedScore.id,
        signalId: existingSignal.id,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" }))),
        ),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
        Effect.provide(createPassthroughChSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      signalId: existingSignal.id,
    })
    expect(fakeAi.calls.embed).toHaveLength(0)
    expect(inserted).toEqual([assignedScore.id])
    expect(startedWorkflows).toHaveLength(0)
  })

  it("skips a human-authored draft (source = annotation) and does not start any workflow", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository } = createFakeSignalRepository()
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const humanDraft = makeScore({
      draftedAt: new Date("2026-03-30T10:30:00.000Z"),
    })
    scores.set(humanDraft.id, humanDraft)

    const result = await Effect.runPromise(
      discoverSignalUseCase({
        organizationId,
        projectId,
        scoreId: humanDraft.id,
        signalId: null,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" }))),
        ),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
        Effect.provide(createPassthroughChSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "DraftScoreNotEligibleForDiscoveryError",
    })
    expect(startedWorkflows).toHaveLength(0)
  })

  it("does not write immutable analytics twice when retrying an already-synced assignment", async () => {
    const existingSignal = makeSignal()
    const assignedScore = makeScore({
      signalId: existingSignal.id,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: signalRepository } = createFakeSignalRepository([existingSignal])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository({
      existsById: () => Effect.succeed(true),
      insert: () => Effect.die("analytics insert should be skipped when the score is already synced"),
    })
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    scores.set(assignedScore.id, assignedScore)

    const result = await Effect.runPromise(
      discoverSignalUseCase({
        organizationId,
        projectId,
        scoreId: assignedScore.id,
        signalId: existingSignal.id,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(
          EvaluationRepository,
          createEvaluationRepository(() => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" }))),
        ),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
        Effect.provide(createPassthroughChSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      signalId: existingSignal.id,
    })
    expect(fakeAi.calls.embed).toHaveLength(0)
    expect(inserted).toHaveLength(0)
    expect(startedWorkflows).toHaveLength(0)
  })
})
