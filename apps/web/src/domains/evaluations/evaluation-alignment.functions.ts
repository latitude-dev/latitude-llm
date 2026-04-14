import {
  buildEvaluationAlignmentJobStatus,
  deriveEvaluationAlignmentMetrics,
  EVALUATION_JOB_STATUS_TTL_SECONDS,
  type Evaluation,
  type EvaluationAlignmentJobStatus,
  EvaluationNotFoundError,
  EvaluationRepository,
  evaluationAlignmentJobStatusKey,
  parseStoredEvaluationAlignmentJobStatus,
  softDeleteEvaluation,
} from "@domain/evaluations"
import { IssueRepository } from "@domain/issues"
import {
  EVALUATION_ALIGNMENT_REFRESH_SIGNAL,
  evaluationAlignmentJobWorkflowId,
  evaluationAlignmentRefreshWorkflowId,
} from "@domain/queue"
import {
  BadRequestError,
  EvaluationId,
  generateId,
  IssueId,
  NotFoundError,
  OrganizationId,
  ProjectId,
} from "@domain/shared"
import { EvaluationRepositoryLive, IssueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient, getWorkflowStarter } from "../../server/clients.ts"

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

const evaluationAlignmentJobStatusInputSchema = z.object({
  jobId: z.string().min(1),
})

const toFailurePayload = (error: unknown): { readonly message: string; readonly code?: string } => {
  const maybeTag = (error as { _tag?: string } | null)?._tag

  if (error instanceof Error) {
    return maybeTag ? { message: error.message, code: maybeTag } : { message: error.message }
  }

  if (typeof error === "string") {
    return maybeTag ? { message: error, code: maybeTag } : { message: error }
  }

  return maybeTag
    ? { message: "Evaluation alignment failed to start", code: maybeTag }
    : { message: "Evaluation alignment failed to start" }
}

const toJobStatusRecord = (status: EvaluationAlignmentJobStatus) => ({
  jobId: status.jobId,
  status: status.status,
  evaluationId: status.evaluationId,
  error: status.error,
  createdAt: status.createdAt.toISOString(),
  updatedAt: status.updatedAt.toISOString(),
})

export type EvaluationAlignmentJobStatusRecord = ReturnType<typeof toJobStatusRecord>

const writeJobStatus = async (input: {
  readonly jobId: string
  readonly status: EvaluationAlignmentJobStatus["status"]
  readonly evaluationId?: string | null
  readonly error?: EvaluationAlignmentJobStatus["error"] | null
}): Promise<EvaluationAlignmentJobStatusRecord> => {
  const redis = getRedisClient()
  const key = evaluationAlignmentJobStatusKey(input.jobId)
  const existingStatus = parseStoredEvaluationAlignmentJobStatus(await redis.get(key))
  const nextStatus = buildEvaluationAlignmentJobStatus({
    existingStatus,
    jobId: input.jobId,
    status: input.status,
    evaluationId: input.evaluationId,
    error: input.error,
  })

  await redis.set(key, JSON.stringify(nextStatus), "EX", EVALUATION_JOB_STATUS_TTL_SECONDS)

  return toJobStatusRecord(nextStatus)
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

export const startEvaluationAlignment = createServerFn({ method: "POST" })
  .inputValidator(evaluationAlignmentJobInputSchema)
  .handler(async ({ data }): Promise<EvaluationAlignmentJobStatusRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const workflowStarter = await getWorkflowStarter()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)
    const jobId = generateId()

    await Effect.runPromise(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const issue = yield* issueRepository.findById(issueId)

        if (issue.projectId !== projectId) {
          return yield* new BadRequestError({
            message: `Issue ${issue.id} does not belong to project ${projectId}`,
          })
        }
      }).pipe(withPostgres(IssueRepositoryLive, client, OrganizationId(organizationId))),
    )

    const pendingStatus = await writeJobStatus({
      jobId,
      status: "pending",
    })

    try {
      await Effect.runPromise(
        workflowStarter.start(
          "evaluationAlignmentWorkflow",
          {
            organizationId,
            projectId,
            issueId,
            jobId,
            reason: "initial-generation",
          },
          {
            workflowId: evaluationAlignmentJobWorkflowId(jobId),
          },
        ),
      )
    } catch (error) {
      await writeJobStatus({
        jobId,
        status: "failed",
        error: toFailurePayload(error),
      })
      throw error
    }

    return pendingStatus
  })

export const getEvaluationAlignmentJobStatus = createServerFn({ method: "GET" })
  .inputValidator(evaluationAlignmentJobStatusInputSchema)
  .handler(async ({ data }): Promise<EvaluationAlignmentJobStatusRecord> => {
    await requireSession()

    const redis = getRedisClient()
    const status = parseStoredEvaluationAlignmentJobStatus(await redis.get(evaluationAlignmentJobStatusKey(data.jobId)))

    if (!status) {
      throw new NotFoundError({
        entity: "Evaluation alignment job",
        id: data.jobId,
      })
    }

    return toJobStatusRecord(status)
  })

export const triggerManualEvaluationRealignment = createServerFn({ method: "POST" })
  .inputValidator(manualRealignmentInputSchema)
  .handler(async ({ data }): Promise<EvaluationAlignmentJobStatusRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const workflowStarter = await getWorkflowStarter()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)
    const jobId = generateId()

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
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId))),
    )

    const pendingStatus = await writeJobStatus({
      jobId,
      status: "pending",
    })

    try {
      await Effect.runPromise(
        workflowStarter.signalWithStart(
          "evaluationAlignmentWorkflow",
          {
            organizationId,
            projectId,
            issueId,
            evaluationId: data.evaluationId,
            jobId,
            refreshLoop: true,
            reason: "manual-realignment",
          },
          {
            workflowId: evaluationAlignmentRefreshWorkflowId(data.evaluationId),
            signal: EVALUATION_ALIGNMENT_REFRESH_SIGNAL,
            signalArgs: [{ reason: "manual-realignment", jobId }],
          },
        ),
      )
    } catch (error) {
      await writeJobStatus({
        jobId,
        status: "failed",
        evaluationId: data.evaluationId,
        error: toFailurePayload(error),
      })
      throw error
    }

    return pendingStatus
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
      }).pipe(withPostgres(EvaluationRepositoryLive, client, OrganizationId(organizationId))),
    )
  })
