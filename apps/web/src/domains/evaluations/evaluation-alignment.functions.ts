import {
  deriveEvaluationAlignmentMetrics,
  type Evaluation,
  EvaluationRepository,
  getSignalAlignmentStateUseCase,
  monitorSignalUseCase,
  type SignalAlignmentState,
  unmonitorSignalUseCase,
  updateEvaluationSampling,
  updateEvaluationTriggerFilter,
} from "@domain/evaluations"
import { WorkflowQuerier, WorkflowStarter } from "@domain/queue"
import {
  BadRequestError,
  EvaluationId,
  filterSetSchema,
  OrganizationId,
  ProjectId,
  SignalId,
  UserId,
} from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import {
  EvaluationRepositoryLive,
  OutboxEventWriterLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getWorkflowQuerier, getWorkflowStarter } from "../../server/clients.ts"

const signalOpInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
})

const updateEvaluationSamplingInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  evaluationId: z.string(),
  sampling: z.number().int().min(0).max(100),
})

const updateEvaluationTriggerFilterInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  evaluationId: z.string(),
  filter: filterSetSchema,
})

export type SignalAlignmentStateRecord = SignalAlignmentState

interface MonitorSignalResponse {
  /** Identifier for the monitor job. */
  readonly jobId: string
  /** Realigned evaluation id, or `null` when a new evaluation is being generated. */
  readonly evaluationId: string | null
}

export const toEvaluationSummaryRecord = (evaluation: Evaluation) => ({
  id: evaluation.id,
  signalId: evaluation.signalId,
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
 * `POST /v1/projects/{projectSlug}/issues/{signalSlug}/monitor`: when the
 * issue has no active evaluation a new one is generated; when one already
 * exists, the use-case realigns it.
 */
export const monitorSignal = createServerFn({ method: "POST" })
  .inputValidator(signalOpInputSchema)
  .handler(async ({ data }): Promise<MonitorSignalResponse> => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()
    const workflowStarter = await getWorkflowStarter()
    const workflowQuerier = await getWorkflowQuerier()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const issue = yield* signalRepository.findById(signalId)

        if (issue.projectId !== projectId) {
          return yield* new BadRequestError({
            message: `Signal ${issue.id} does not belong to project ${projectId}`,
          })
        }

        return yield* monitorSignalUseCase({
          organizationId: orgId,
          projectId,
          signalId,
          actorUserId: UserId(userId),
          isAutomaticallyMonitored: issue.source === "flagger",
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive),
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
 * to it. Mirrors the API's `POST /v1/projects/{projectSlug}/issues/{signalSlug}/unmonitor`.
 */
export const unmonitorSignal = createServerFn({ method: "POST" })
  .inputValidator(signalOpInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      unmonitorSignalUseCase({
        projectId: ProjectId(data.projectId),
        signalId: SignalId(data.signalId),
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )
  })

export const getSignalAlignmentState = createServerFn({ method: "GET" })
  .inputValidator(signalOpInputSchema)
  .handler(async ({ data }): Promise<SignalAlignmentStateRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const workflowQuerier = await getWorkflowQuerier()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const issue = yield* signalRepository.findById(signalId)
        return yield* getSignalAlignmentStateUseCase({
          projectId,
          signalId,
          isAutomaticallyMonitored: issue.source === "flagger",
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive),
          client,
          OrganizationId(organizationId),
        ),
        Effect.provide(Layer.succeed(WorkflowQuerier, workflowQuerier)),
        withTracing,
      ),
    )
  })

export const updateSignalEvaluationSampling = createServerFn({ method: "POST" })
  .inputValidator(updateEvaluationSamplingInputSchema)
  .handler(async ({ data }): Promise<EvaluationSummaryRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationRepository
        const evaluation = yield* repository.findById(EvaluationId(data.evaluationId))

        if (evaluation.projectId !== projectId || evaluation.signalId !== signalId) {
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

export const updateSignalEvaluationTriggerFilter = createServerFn({ method: "POST" })
  .inputValidator(updateEvaluationTriggerFilterInputSchema)
  .handler(async ({ data }): Promise<EvaluationSummaryRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationRepository
        const evaluation = yield* repository.findById(EvaluationId(data.evaluationId))

        if (evaluation.projectId !== projectId || evaluation.signalId !== signalId) {
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
