import {
  deriveEvaluationAlignmentMetrics,
  type Evaluation,
  EvaluationNotFoundError,
  EvaluationRepository,
  isActiveEvaluation,
  softDeleteEvaluation,
} from "@domain/evaluations"
import { IssueRepository } from "@domain/issues"
import { BadRequestError, EvaluationId, generateId, IssueId, OrganizationId, ProjectId } from "@domain/shared"
import { EvaluationRepositoryLive, IssueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getOutboxWriter, getPostgresClient, getWorkflowQuerier, getWorkflowStarter } from "../../server/clients.ts"

const evaluationAlignmentJobInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

const manualRealignmentInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
  evaluationId: z.string(),
})

const softDeleteEvaluationInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
  evaluationId: z.string(),
})

const issueAlignmentStateInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

export type IssueAlignmentStateRecord =
  | { readonly kind: "idle" }
  | { readonly kind: "generating" }
  | { readonly kind: "realigning"; readonly evaluationId: string }

const buildGenerateWorkflowId = (issueId: string) => `evaluations:generate:${issueId}`
const buildOptimizeWorkflowId = (evaluationId: string) => `evaluations:optimize:${evaluationId}`
const buildRefreshAlignmentWorkflowId = (evaluationId: string) => `evaluations:refreshAlignment:${evaluationId}`

export const toEvaluationSummaryRecord = (evaluation: Evaluation) => ({
  id: evaluation.id,
  issueId: evaluation.issueId,
  name: evaluation.name,
  description: evaluation.description,
  alignedAt: evaluation.alignedAt.toISOString(),
  archivedAt: evaluation.archivedAt?.toISOString() ?? null,
  deletedAt: evaluation.deletedAt?.toISOString() ?? null,
  createdAt: evaluation.createdAt.toISOString(),
  updatedAt: evaluation.updatedAt.toISOString(),
  trigger: evaluation.trigger,
  alignment: {
    evaluationHash: evaluation.alignment.evaluationHash,
    confusionMatrix: evaluation.alignment.confusionMatrix,
    metrics: deriveEvaluationAlignmentMetrics(evaluation.alignment.confusionMatrix),
  },
})

export type EvaluationSummaryRecord = ReturnType<typeof toEvaluationSummaryRecord>

export const startEvaluationAlignment = createServerFn({ method: "POST" })
  .inputValidator(evaluationAlignmentJobInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()
    const workflowStarter = await getWorkflowStarter()
    const workflowQuerier = await getWorkflowQuerier()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)
    const jobId = generateId()
    const workflowId = buildGenerateWorkflowId(issueId)

    await Effect.runPromise(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const issue = yield* issueRepository.findById(issueId)

        if (issue.projectId !== projectId) {
          return yield* new BadRequestError({
            message: `Issue ${issue.id} does not belong to project ${projectId}`,
          })
        }
      }).pipe(withPostgres(IssueRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )

    // Pre-check: reject with a friendly BadRequestError when a generation
    // workflow is already running for this issue. Temporal's workflow-id
    // dedupe (`workflowIdConflictPolicy: "FAIL"`) is still the ultimate
    // safety net — if a second request slips through between this describe
    // and the start below, `workflowStarter.start` propagates Temporal's
    // `WorkflowExecutionAlreadyStartedError` so the outbox write is never
    // reached and no duplicate kickoff occurs. This pre-check exists purely
    // to surface a readable message to the UI.
    const existingDescription = await Effect.runPromise(workflowQuerier.describe(workflowId))
    if (existingDescription?.status === "running") {
      throw new BadRequestError({
        message: "An evaluation is already being generated for this issue",
      })
    }

    await Effect.runPromise(
      workflowStarter
        .start(
          "optimizeEvaluationWorkflow",
          {
            organizationId,
            projectId,
            issueId,
            evaluationId: null,
            jobId,
          },
          { workflowId },
        )
        .pipe(withTracing),
    )

    const outboxWriter = getOutboxWriter()
    await Effect.runPromise(
      outboxWriter
        .write({
          eventName: "EvaluationConfigured",
          aggregateType: "evaluation",
          aggregateId: jobId,
          organizationId,
          payload: {
            organizationId,
            actorUserId: userId,
            projectId: data.projectId,
            evaluationId: jobId,
            issueId: data.issueId,
          },
        })
        .pipe(withTracing),
    )
  })

export const triggerManualEvaluationRealignment = createServerFn({ method: "POST" })
  .inputValidator(manualRealignmentInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const workflowStarter = await getWorkflowStarter()
    const workflowQuerier = await getWorkflowQuerier()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)
    const jobId = generateId()
    const workflowId = buildOptimizeWorkflowId(data.evaluationId)

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationRepository
        const evaluation = yield* repository.findById(EvaluationId(data.evaluationId))

        if (!evaluation) {
          return yield* new EvaluationNotFoundError({
            evaluationId: data.evaluationId,
          })
        }

        if (evaluation.projectId !== projectId || evaluation.issueId !== issueId) {
          return yield* new BadRequestError({
            message: `Evaluation ${evaluation.id} does not match the requested issue or project`,
          })
        }
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )

    // Pre-check: reject with a friendly BadRequestError when an optimization
    // workflow is already running for this evaluation. The UI contract is
    // "one manual realignment at a time per evaluation" — surface an explicit
    // error instead of letting Temporal's `workflowIdConflictPolicy: "FAIL"`
    // surface a generic already-started error. That policy is still the
    // ultimate safety net for races between this describe and the start below.
    const existingDescription = await Effect.runPromise(workflowQuerier.describe(workflowId))
    if (existingDescription?.status === "running") {
      throw new BadRequestError({
        message: "This evaluation is already being realigned",
      })
    }

    await Effect.runPromise(
      workflowStarter
        .start(
          "optimizeEvaluationWorkflow",
          {
            organizationId,
            projectId,
            issueId,
            evaluationId: data.evaluationId,
            jobId,
          },
          { workflowId },
        )
        .pipe(withTracing),
    )
  })

export const getIssueAlignmentState = createServerFn({ method: "GET" })
  .inputValidator(issueAlignmentStateInputSchema)
  .handler(async ({ data }): Promise<IssueAlignmentStateRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const workflowQuerier = await getWorkflowQuerier()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    // Initial generation runs as `optimizeEvaluationWorkflow` under the
    // per-issue `evaluations:generate:${issueId}` id until an evaluation row
    // is persisted. A running workflow here unambiguously means "actively
    // running" — the new workflows are linear and exit on completion, so
    // there is no more "alive-but-napping between timers" state.
    const initialDescription = await Effect.runPromise(workflowQuerier.describe(buildGenerateWorkflowId(issueId)))

    if (initialDescription?.status === "running") {
      return { kind: "generating" }
    }

    const activeEvaluations = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationRepository
        const page = yield* repository.listByIssueId({
          projectId,
          issueId,
          options: { lifecycle: "active" },
        })
        return page.items.filter(isActiveEvaluation)
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )

    // Per active evaluation, the UI shows `realigning` whenever either the
    // automatic refresh workflow or the optimization workflow is running —
    // from the user's perspective both block the "Realign now" button.
    // `describe()`-only polling stays honest now that no workflow sleeps
    // between activities.
    for (const evaluation of activeEvaluations) {
      const descriptions = await Promise.all([
        Effect.runPromise(workflowQuerier.describe(buildRefreshAlignmentWorkflowId(evaluation.id))),
        Effect.runPromise(workflowQuerier.describe(buildOptimizeWorkflowId(evaluation.id))),
      ])
      if (descriptions.some((description) => description?.status === "running")) {
        return {
          kind: "realigning",
          evaluationId: evaluation.id,
        }
      }
    }

    return { kind: "idle" }
  })

export const softDeleteIssueEvaluation = createServerFn({ method: "POST" })
  .inputValidator(softDeleteEvaluationInputSchema)
  .handler(async ({ data }): Promise<EvaluationSummaryRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationRepository
        const evaluation = yield* repository.findById(EvaluationId(data.evaluationId))

        if (evaluation.projectId !== projectId || evaluation.issueId !== issueId) {
          return yield* new BadRequestError({
            message: `Evaluation ${evaluation.id} does not match the requested issue or project`,
          })
        }

        // Temporary until the evaluations dashboard exists: unmonitoring from the
        // issue drawer should remove the linked evaluation from current UI flows,
        // so we soft delete it instead of archiving it into a dashboard users
        // cannot reach yet.
        const deletedEvaluation = softDeleteEvaluation({ evaluation })
        yield* repository.save(deletedEvaluation)

        return toEvaluationSummaryRecord(deletedEvaluation)
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )
  })
