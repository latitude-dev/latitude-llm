import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { WorkflowQuerier, type WorkflowQuerierShape, WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { BadRequestError, EvaluationId, IssueId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { defaultEvaluationTrigger, type Evaluation, emptyEvaluationAlignment } from "../entities/evaluation.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../ports/evaluation-repository.ts"
import { monitorIssueUseCase } from "./monitor-issue.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const issueId = IssueId("i".repeat(24))
const actorUserId = UserId("u".repeat(24))

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation =>
  ({
    id: EvaluationId("e".repeat(24)),
    organizationId,
    projectId,
    issueId,
    name: "Eval",
    description: "Generated description",
    script: "return { passed: false }",
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash-1"),
    alignedAt: new Date("2026-04-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  }) as Evaluation

const createEvaluationRepository = (activeEvaluations: readonly Evaluation[]): EvaluationRepositoryShape => ({
  findById: () => Effect.die("Unexpected findById"),
  save: () => Effect.die("Unexpected save"),
  listByProjectId: () => Effect.die("Unexpected listByProjectId"),
  listByIssueId: () =>
    Effect.succeed({
      items: activeEvaluations,
      hasMore: false,
      limit: activeEvaluations.length,
      offset: 0,
    }),
  listByIssueIds: () => Effect.die("Unexpected listByIssueIds"),
  archive: () => Effect.die("Unexpected archive"),
  unarchive: () => Effect.die("Unexpected unarchive"),
  softDelete: () => Effect.die("Unexpected softDelete"),
  softDeleteByIssueId: () => Effect.die("Unexpected softDeleteByIssueId"),
})

interface StartedWorkflow {
  readonly workflow: string
  readonly input: unknown
  readonly workflowId: string
}

const createWorkflowStarter = () => {
  const started: StartedWorkflow[] = []
  const workflowStarter: WorkflowStarterShape = {
    start: (workflow, input, options) =>
      Effect.sync(() => {
        started.push({ workflow, input, workflowId: options.workflowId })
      }),
    signalWithStart: () => Effect.die("Unexpected signalWithStart"),
  }
  return { workflowStarter, started }
}

const createWorkflowQuerier = (running: ReadonlySet<string> = new Set()) => {
  const describeCalls: string[] = []
  const workflowQuerier: WorkflowQuerierShape = {
    describe: (workflowId) =>
      Effect.sync(() => {
        describeCalls.push(workflowId)
        if (!running.has(workflowId)) return null
        return {
          status: "running",
          runId: "run-1",
          startTime: new Date("2026-04-01T00:00:00.000Z"),
          closeTime: null,
        }
      }),
    query: () => Effect.die("Unexpected query"),
  }
  return { workflowQuerier, describeCalls }
}

const createOutboxEventWriter = () => {
  const events: OutboxWriteEvent[] = []
  const writer = OutboxEventWriter.of({
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })
  return { writer, events }
}

const buildLayer = (input: {
  readonly activeEvaluations?: readonly Evaluation[]
  readonly runningWorkflows?: ReadonlySet<string>
}) => {
  const { workflowStarter, started } = createWorkflowStarter()
  const { workflowQuerier, describeCalls } = createWorkflowQuerier(input.runningWorkflows)
  const { writer, events } = createOutboxEventWriter()

  return {
    started,
    describeCalls,
    events,
    layer: Layer.mergeAll(
      Layer.succeed(EvaluationRepository, createEvaluationRepository(input.activeEvaluations ?? [])),
      Layer.succeed(WorkflowStarter, workflowStarter),
      Layer.succeed(WorkflowQuerier, workflowQuerier),
      Layer.succeed(OutboxEventWriter, writer),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    ),
  }
}

describe("monitorIssueUseCase", () => {
  describe("start path (no active evaluation)", () => {
    it("kicks off the generation workflow and emits `EvaluationCreated`", async () => {
      const { started, events, layer } = buildLayer({})

      const result = await Effect.runPromise(
        monitorIssueUseCase({ organizationId, projectId, issueId, actorUserId }).pipe(Effect.provide(layer)),
      )

      expect(result.evaluationId).toBeNull()
      expect(started).toHaveLength(1)
      expect(started[0]?.workflow).toBe("optimizeEvaluationWorkflow")
      expect(started[0]?.workflowId).toBe(`evaluations:generate:${issueId}`)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        eventName: "EvaluationCreated",
        aggregateType: "evaluation",
        organizationId,
        payload: { actorUserId, projectId, issueId },
      })
    })

    it("records a blank `actorUserId` on the outbox event when omitted (API-key callers)", async () => {
      const { events, layer } = buildLayer({})

      await Effect.runPromise(monitorIssueUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)))

      expect(events[0]?.payload).toMatchObject({ actorUserId: "" })
    })

    it("fails with BadRequestError when a generation workflow is already running", async () => {
      const { started, events, layer } = buildLayer({
        runningWorkflows: new Set([`evaluations:generate:${issueId}`]),
      })

      const error = await Effect.runPromise(
        monitorIssueUseCase({ organizationId, projectId, issueId, actorUserId }).pipe(
          Effect.flip,
          Effect.provide(layer),
        ),
      )

      expect(error).toBeInstanceOf(BadRequestError)
      expect((error as BadRequestError).message).toMatch(/already being generated/i)
      expect(started).toEqual([])
      expect(events).toEqual([])
    })

    it("rejects with BadRequestError when the issue is automatically monitored", async () => {
      const { started, events, describeCalls, layer } = buildLayer({})

      const error = await Effect.runPromise(
        monitorIssueUseCase({
          organizationId,
          projectId,
          issueId,
          actorUserId,
          isAutomaticallyMonitored: true,
        }).pipe(Effect.flip, Effect.provide(layer)),
      )

      expect(error).toBeInstanceOf(BadRequestError)
      expect((error as BadRequestError).message).toMatch(/automatically monitored/i)
      expect(started).toEqual([])
      expect(events).toEqual([])
      // The use-case short-circuits before touching the workflow querier.
      expect(describeCalls).toEqual([])
    })
  })

  describe("realign path (an active evaluation exists)", () => {
    const existing = makeEvaluation({ id: EvaluationId("a".repeat(24)) })

    it("kicks off the optimization workflow for the latest active evaluation and emits `EvaluationAligned`", async () => {
      const { started, events, layer } = buildLayer({ activeEvaluations: [existing] })

      const result = await Effect.runPromise(
        monitorIssueUseCase({ organizationId, projectId, issueId, actorUserId }).pipe(Effect.provide(layer)),
      )

      expect(result.evaluationId).toBe(existing.id)
      expect(started).toHaveLength(1)
      expect(started[0]?.workflowId).toBe(`evaluations:optimize:${existing.id}`)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        eventName: "EvaluationAligned",
        aggregateType: "evaluation",
        aggregateId: existing.id,
        payload: { evaluationId: existing.id, issueId },
      })
    })

    it("realigns even when the issue is flagger-sourced — automatic monitoring only blocks first-time start", async () => {
      const { started, events, layer } = buildLayer({ activeEvaluations: [existing] })

      const result = await Effect.runPromise(
        monitorIssueUseCase({
          organizationId,
          projectId,
          issueId,
          actorUserId,
          isAutomaticallyMonitored: true,
        }).pipe(Effect.provide(layer)),
      )

      expect(result.evaluationId).toBe(existing.id)
      expect(started).toHaveLength(1)
      expect(events).toHaveLength(1)
    })

    it("picks the most recently created active evaluation when several exist", async () => {
      const older = makeEvaluation({
        id: EvaluationId("a".repeat(24)),
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
      })
      const newer = makeEvaluation({
        id: EvaluationId("b".repeat(24)),
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      })
      const { started, layer } = buildLayer({ activeEvaluations: [older, newer] })

      const result = await Effect.runPromise(
        monitorIssueUseCase({ organizationId, projectId, issueId, actorUserId }).pipe(Effect.provide(layer)),
      )

      expect(result.evaluationId).toBe(newer.id)
      expect(started[0]?.workflowId).toBe(`evaluations:optimize:${newer.id}`)
    })

    it("fails with BadRequestError when an optimization workflow is already running", async () => {
      const { started, layer } = buildLayer({
        activeEvaluations: [existing],
        runningWorkflows: new Set([`evaluations:optimize:${existing.id}`]),
      })

      const error = await Effect.runPromise(
        monitorIssueUseCase({ organizationId, projectId, issueId, actorUserId }).pipe(
          Effect.flip,
          Effect.provide(layer),
        ),
      )

      expect(error).toBeInstanceOf(BadRequestError)
      expect((error as BadRequestError).message).toMatch(/already being realigned/i)
      expect(started).toEqual([])
    })
  })
})
