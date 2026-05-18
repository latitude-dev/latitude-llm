import {
  deriveEvaluationAlignmentMetrics,
  type Evaluation,
  EvaluationRepository,
  getIssueAlignmentStateUseCase,
  type IssueAlignmentState,
  monitorIssueUseCase,
  unmonitorIssueUseCase,
  updateEvaluationSampling,
  updateEvaluationTriggerFilter,
} from "@domain/evaluations"
import { IssueRepository } from "@domain/issues"
import { WorkflowQuerier, WorkflowStarter } from "@domain/queue"
import {
  BadRequestError,
  EvaluationId,
  filterSetSchema,
  IssueId,
  OrganizationId,
  ProjectId,
  UserId,
} from "@domain/shared"
import {
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  OutboxEventWriterLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getWorkflowQuerier, getWorkflowStarter } from "../../server/clients.ts"

const issueOpInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

const updateEvaluationSamplingInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
  evaluationId: z.string(),
  sampling: z.number().int().min(0).max(100),
})

const updateEvaluationTriggerFilterInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
  evaluationId: z.string(),
  filter: filterSetSchema,
})

export type IssueAlignmentStateRecord = IssueAlignmentState

interface MonitorIssueResponse {
  /** Identifier for the monitor job. */
  readonly jobId: string
  /** Realigned evaluation id, or `null` when a new evaluation is being generated. */
  readonly evaluationId: string | null
}

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

/**
 * Starts (or realigns) monitoring for an issue. Mirrors the public API's
 * `POST /v1/projects/{projectSlug}/issues/{issueSlug}/monitor`: when the
 * issue has no active evaluation a new one is generated; when one already
 * exists, the use-case realigns it.
 */
export const monitorIssue = createServerFn({ method: "POST" })
  .inputValidator(issueOpInputSchema)
  .handler(async ({ data }): Promise<MonitorIssueResponse> => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()
    const workflowStarter = await getWorkflowStarter()
    const workflowQuerier = await getWorkflowQuerier()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const issue = yield* issueRepository.findById(issueId)

        if (issue.projectId !== projectId) {
          return yield* new BadRequestError({
            message: `Issue ${issue.id} does not belong to project ${projectId}`,
          })
        }

        return yield* monitorIssueUseCase({
          organizationId: orgId,
          projectId,
          issueId,
          actorUserId: UserId(userId),
          isAutomaticallyMonitored: issue.source === "flagger",
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive),
          client,
          orgId,
        ),
        Effect.provide(Layer.succeed(WorkflowStarter, workflowStarter)),
        Effect.provide(Layer.succeed(WorkflowQuerier, workflowQuerier)),
        withTracing,
      ),
    )

    return { jobId: result.jobId, evaluationId: result.evaluationId as string | null }
  })

/**
 * Stops monitoring an issue by soft-deleting every active evaluation linked
 * to it. Mirrors the API's `POST /v1/projects/{projectSlug}/issues/{issueSlug}/unmonitor`.
 */
export const unmonitorIssue = createServerFn({ method: "POST" })
  .inputValidator(issueOpInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      unmonitorIssueUseCase({
        projectId: ProjectId(data.projectId),
        issueId: IssueId(data.issueId),
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )
  })

export const getIssueAlignmentState = createServerFn({ method: "GET" })
  .inputValidator(issueOpInputSchema)
  .handler(async ({ data }): Promise<IssueAlignmentStateRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const workflowQuerier = await getWorkflowQuerier()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const issue = yield* issueRepository.findById(issueId)
        return yield* getIssueAlignmentStateUseCase({
          projectId,
          issueId,
          isAutomaticallyMonitored: issue.source === "flagger",
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive),
          client,
          OrganizationId(organizationId),
        ),
        Effect.provide(Layer.succeed(WorkflowQuerier, workflowQuerier)),
        withTracing,
      ),
    )
  })

export const updateIssueEvaluationSampling = createServerFn({ method: "POST" })
  .inputValidator(updateEvaluationSamplingInputSchema)
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

        const updatedEvaluation = updateEvaluationSampling({ evaluation, sampling: data.sampling })
        yield* repository.save(updatedEvaluation)

        return toEvaluationSummaryRecord(updatedEvaluation)
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )
  })

export const updateIssueEvaluationTriggerFilter = createServerFn({ method: "POST" })
  .inputValidator(updateEvaluationTriggerFilterInputSchema)
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

        const updatedEvaluation = updateEvaluationTriggerFilter({ evaluation, filter: data.filter })
        yield* repository.save(updatedEvaluation)

        return toEvaluationSummaryRecord(updatedEvaluation)
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )
  })
