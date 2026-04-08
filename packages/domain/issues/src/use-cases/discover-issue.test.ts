import { createFakeAI } from "@domain/ai/testing"
import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { type Score, ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  IssueId,
  NotFoundError,
  OrganizationId,
  OutboxEventWriter,
  ProjectId,
  ScoreId,
  SqlClient,
} from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueProjectionRepository, createFakeIssueRepository } from "../testing/index.ts"
import { discoverIssueUseCase } from "./discover-issue.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"

const makeEmbedding = (): number[] =>
  Array.from({ length: CENTROID_EMBEDDING_DIMENSIONS }, (_, index) => {
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
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    issueId: null,
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
    createdAt: new Date("2026-03-30T10:00:00.000Z"),
    updatedAt: new Date("2026-03-30T10:00:00.000Z"),
    ...overrides,
  }) as Score

const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-29T10:00:00.000Z"),
  updatedAt: new Date("2026-03-29T10:00:00.000Z"),
  ...overrides,
})

const makeEvaluation = (issueId: string, overrides: Partial<Evaluation> = {}): Evaluation =>
  ({
    id: "eeeeeeeeeeeeeeeeeeeeeeee",
    organizationId,
    projectId: ProjectId(projectId),
    issueId: IssueId(issueId),
    name: "Token leakage evaluation",
    description: "Flags token leakage",
    script: "return { passed: false }",
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
  }

  return { workflowStarter, startedWorkflows }
}

describe("discoverIssueUseCase", () => {
  it("assigns a published annotation directly when a preselected issue is provided", async () => {
    const existingIssue = makeIssue()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository([existingIssue])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const score = makeScore()
    const writtenEvents: unknown[] = []
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      discoverIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: existingIssue.id,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(EvaluationRepository, {
          findById: () => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" })),
        }),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "assigned-existing",
      issueId: existingIssue.id,
    })
    expect(scores.get(score.id)?.issueId).toBe(existingIssue.id)
    expect(issues.get(existingIssue.id)?.centroid.mass).toBeGreaterThan(0)
    expect(inserted).toEqual([score.id])
    expect(store.size).toBe(1)
    expect(startedWorkflows).toHaveLength(0)
    expect(writtenEvents).toEqual([
      expect.objectContaining({
        eventName: "IssueRefreshRequested",
        payload: expect.objectContaining({
          projectId,
          issueId: existingIssue.id,
        }),
      }),
    ])
  })

  it("uses the linked evaluation issue before starting the full workflow", async () => {
    const existingIssue = makeIssue()
    const linkedEvaluation = makeEvaluation(existingIssue.id)
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository } = createFakeIssueRepository([existingIssue])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    scores.set(
      ScoreId("tttttttttttttttttttttttt"),
      makeScore({
        id: ScoreId("tttttttttttttttttttttttt"),
        source: "evaluation",
        sourceId: linkedEvaluation.id,
        metadata: {
          evaluationHash: "eval-hash-v1",
        },
      }),
    )

    const result = await Effect.runPromise(
      discoverIssueUseCase({
        organizationId,
        projectId,
        scoreId: ScoreId("tttttttttttttttttttttttt"),
        issueId: null,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(EvaluationRepository, {
          findById: (id) =>
            id === linkedEvaluation.id
              ? Effect.succeed(linkedEvaluation)
              : Effect.fail(new NotFoundError({ entity: "Evaluation", id })),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "assigned-existing",
      issueId: existingIssue.id,
    })
    expect(inserted).toEqual([ScoreId("tttttttttttttttttttttttt")])
    expect(store.size).toBe(1)
    expect(startedWorkflows).toHaveLength(0)
  })

  it("starts the discovery workflow when no selected or linked issue is available", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository } = createFakeIssueRepository()
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const score = makeScore()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      discoverIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: null,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(EvaluationRepository, {
          findById: () => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" })),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      scoreId: score.id,
    })
    expect(inserted).toHaveLength(0)
    expect(store.size).toBe(0)
    expect(startedWorkflows).toEqual([
      {
        workflow: "issueDiscoveryWorkflow",
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
    const foreignIssue = makeIssue({
      id: IssueId("jjjjjjjjjjjjjjjjjjjjjjjj"),
      projectId: otherProjectId,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository([foreignIssue])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const score = makeScore()
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      discoverIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: foreignIssue.id,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(EvaluationRepository, {
          findById: () => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" })),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      scoreId: score.id,
    })
    expect(scores.get(score.id)?.issueId).toBeNull()
    expect(issues.get(foreignIssue.id)?.centroid.mass).toBe(0)
    expect(inserted).toHaveLength(0)
    expect(store.size).toBe(0)
    expect(startedWorkflows).toHaveLength(1)
  })

  it("falls back to the workflow when the linked evaluation belongs to another project", async () => {
    const foreignIssue = makeIssue({
      id: IssueId("kkkkkkkkkkkkkkkkkkkkkkkk"),
      projectId: otherProjectId,
    })
    const foreignEvaluation = makeEvaluation(foreignIssue.id, {
      id: "ffffffffffffffffffffffff",
      projectId: ProjectId(otherProjectId),
      issueId: foreignIssue.id,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository, issues } = createFakeIssueRepository([foreignIssue])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const score = makeScore({
      id: ScoreId("vvvvvvvvvvvvvvvvvvvvvvvv"),
      source: "evaluation",
      sourceId: foreignEvaluation.id,
      metadata: {
        evaluationHash: "eval-hash-v2",
      },
    })
    scores.set(score.id, score)

    const result = await Effect.runPromise(
      discoverIssueUseCase({
        organizationId,
        projectId,
        scoreId: score.id,
        issueId: null,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(EvaluationRepository, {
          findById: (id) =>
            id === foreignEvaluation.id
              ? Effect.succeed(foreignEvaluation)
              : Effect.fail(new NotFoundError({ entity: "Evaluation", id })),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      scoreId: score.id,
    })
    expect(scores.get(score.id)?.issueId).toBeNull()
    expect(issues.get(foreignIssue.id)?.centroid.mass).toBe(0)
    expect(inserted).toHaveLength(0)
    expect(store.size).toBe(0)
    expect(startedWorkflows).toHaveLength(1)
  })

  it("replays analytics and projection syncs when the score was already assigned before retry", async () => {
    const existingIssue = makeIssue()
    const assignedScore = makeScore({
      issueId: existingIssue.id,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository } = createFakeIssueRepository([existingIssue])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    scores.set(assignedScore.id, assignedScore)

    const result = await Effect.runPromise(
      discoverIssueUseCase({
        organizationId,
        projectId,
        scoreId: assignedScore.id,
        issueId: existingIssue.id,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(EvaluationRepository, {
          findById: () => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" })),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      issueId: existingIssue.id,
    })
    expect(fakeAi.calls.embed).toHaveLength(0)
    expect(inserted).toEqual([assignedScore.id])
    expect(store.size).toBe(0)
    expect(startedWorkflows).toHaveLength(0)
  })

  it("does not write immutable analytics twice when retrying an already-synced assignment", async () => {
    const existingIssue = makeIssue()
    const assignedScore = makeScore({
      issueId: existingIssue.id,
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: issueRepository } = createFakeIssueRepository([existingIssue])
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository({
      existsById: () => Effect.succeed(true),
      insert: () => Effect.die("analytics insert should be skipped when the score is already synced"),
    })
    const { service: issueProjectionRepository, store } = createFakeIssueProjectionRepository({ organizationId })
    const fakeAi = createFakeAI({
      embed: () => Effect.succeed({ embedding: makeEmbedding() }),
    })
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    scores.set(assignedScore.id, assignedScore)

    const result = await Effect.runPromise(
      discoverIssueUseCase({
        organizationId,
        projectId,
        scoreId: assignedScore.id,
        issueId: existingIssue.id,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueProjectionRepository, issueProjectionRepository),
        Effect.provideService(EvaluationRepository, {
          findById: () => Effect.fail(new NotFoundError({ entity: "Evaluation", id: "" })),
        }),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provide(fakeAi.layer),
        Effect.provideService(WorkflowStarter, workflowStarter),
        Effect.provide(createPassthroughSqlClient(organizationId)),
      ),
    )

    expect(result).toEqual({
      action: "already-assigned",
      issueId: existingIssue.id,
    })
    expect(fakeAi.calls.embed).toHaveLength(0)
    expect(inserted).toHaveLength(0)
    expect(store.size).toBe(0)
    expect(startedWorkflows).toHaveLength(0)
  })
})
