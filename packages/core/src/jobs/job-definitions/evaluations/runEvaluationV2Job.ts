import {
  EvaluationResultValue,
  MainSpanType,
  Span,
  SpanWithDetails,
} from '@latitude-data/constants'
import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError, UnprocessableEntityError } from '../../../lib/errors'
import { isRetryableError } from '../../../lib/isRetryableError'
import {
  CommitsRepository,
  DatasetRowsRepository,
  DatasetsRepository,
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
  ExperimentsRepository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../repositories'
import { Workspace } from '../../../schema/models/types/Workspace'
import { runEvaluationV2 } from '../../../services/evaluationsV2/run'
import { createEvaluationResultV2 } from '../../../services/evaluationsV2/results/create'
import { updateExperimentStatus } from '../../../services/experiments/updateStatus'
import { captureException } from '../../../utils/datadogCapture'

export type RunEvaluationV2JobData = {
  workspaceId: number
  commitId: number
  evaluationUuid: string
  spanId: string
  traceId: string
  experimentUuid?: string
  datasetId?: number
  datasetLabel?: string
  datasetRowId?: number
  dry?: boolean
}

export function runEvaluationV2JobKey({
  workspaceId,
  commitId,
  evaluationUuid,
  spanId,
  traceId,
  experimentUuid,
  datasetId,
  datasetLabel,
  datasetRowId,
}: RunEvaluationV2JobData) {
  return `runEvaluationV2Job-${workspaceId}-${commitId}-${evaluationUuid}-${spanId}-${traceId}-${experimentUuid}-${datasetId}-${datasetLabel}-${datasetRowId}`
}

export const runEvaluationV2Job = async (job: Job<RunEvaluationV2JobData>) => {
  const {
    workspaceId,
    commitId,
    evaluationUuid,
    spanId,
    traceId,
    experimentUuid,
    datasetId,
    datasetLabel,
    datasetRowId,
    dry,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  let experiment = undefined
  if (experimentUuid) {
    const experimentsRepository = new ExperimentsRepository(workspace.id)
    experiment = await experimentsRepository
      .findByUuid(experimentUuid)
      .then((r) => r.unwrap())

    if (experiment.finishedAt) return
  }

  const spansRepo = new SpansRepository(workspace.id)
  const spansMetadataRepo = new SpanMetadatasRepository(workspace.id)
  const span = await spansRepo.get({ traceId, spanId }).then((r) => r.unwrap())

  try {
    const commitsRepository = new CommitsRepository(workspace.id)
    const commit = await commitsRepository
      .getCommitById(commitId)
      .then((r) => r.unwrap())

    if (!span) throw new NotFoundError('Span not found')
    if (!span.documentUuid) throw new NotFoundError('Span document not found')
    if (!span.documentLogUuid) {
      throw new NotFoundError('Span document log not found')
    }
    const metadata = await spansMetadataRepo
      .get({ spanId, traceId })
      .then((r) => r.unwrap())

    const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
    const evaluation = await evaluationsRepository
      .getAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid: span.documentUuid,
        evaluationUuid: evaluationUuid,
      })
      .then((r) => r.unwrap())

    let dataset = undefined
    if (datasetId) {
      const datasetsRepository = new DatasetsRepository(workspace.id)
      dataset = await datasetsRepository.find(datasetId).then((r) => r.unwrap())
    }

    let datasetRow = undefined
    if (datasetRowId) {
      const rowsRepository = new DatasetRowsRepository(workspace.id)
      datasetRow = await rowsRepository
        .find(datasetRowId)
        .then((r) => r.unwrap())
    }

    const { result } = await runEvaluationV2({
      evaluation,
      span: { ...span, metadata } as SpanWithDetails<MainSpanType>,
      experiment,
      dataset,
      datasetLabel,
      datasetRow,
      commit,
      workspace,
      dry,
    }).then((r) => r.unwrap())

    if (experiment && span.documentLogUuid && !dry) {
      await updateExperimentStatus(
        { workspaceId, experiment },
        async (progressTracker) => {
          if (result.error) {
            return progressTracker.evaluationError(span.documentLogUuid!)
          }

          return progressTracker.evaluationFinished(span.documentLogUuid!, {
            passed: result.hasPassed,
            score: result.normalizedScore,
          })
        },
      ).then((r) => r.unwrap())
    }
    if (dry) {
      return {
        hasPassed: result.hasPassed,
        evaluatedSpanId: result.evaluatedSpanId,
        evaluatedTraceId: result.evaluatedTraceId,
      }
    }
  } catch (error) {
    if (isRetryableError(error as Error)) throw error
    if (shouldRetryTraceAssembly(error as Error, job)) throw error

    captureException(error as Error)

    if (experiment && span?.documentLogUuid && !dry) {
      await updateExperimentStatus(
        { workspaceId, experiment },
        (progressTracker) =>
          progressTracker.evaluationError(span.documentLogUuid!),
      )
    } else if (!experiment && !dry && span && isTraceAssemblyError(error)) {
      await recordLiveEvalAssemblyFailure({
        workspace,
        span,
        commitId,
        evaluationUuid,
        error: error as Error,
      })
    }
    if (dry) throw error
  }
}

/**
 * Trace assembly errors are usually a race with OTel ingestion: the prompt
 * span's spanCreated event arrives before the completion span's batch lands
 * in the read store. Re-throwing lets BullMQ retry the job with exponential
 * backoff, freeing the worker slot during the wait.
 */
const RETRYABLE_TRACE_ASSEMBLY_MESSAGES = new Set([
  'Cannot assemble trace',
  'Cannot find completion span',
  'Completion span metadata is missing',
])

function shouldRetryTraceAssembly(
  error: Error,
  job: Job<RunEvaluationV2JobData>,
): boolean {
  if (!isTraceAssemblyError(error)) return false

  const maxAttempts = job.opts.attempts ?? 1
  return job.attemptsMade + 1 < maxAttempts
}

function isTraceAssemblyError(error: unknown): boolean {
  return (
    error instanceof UnprocessableEntityError &&
    RETRYABLE_TRACE_ASSEMBLY_MESSAGES.has(error.message)
  )
}

/**
 * Persists a failed evaluation result for live-eval jobs that exhausted their
 * retries on a trace-assembly error. Without this the failure disappears (the
 * catch block returns silently for non-experiment runs) and the UI shows "-",
 * which is indistinguishable from "not yet evaluated".
 */
async function recordLiveEvalAssemblyFailure({
  workspace,
  span,
  commitId,
  evaluationUuid,
  error,
}: {
  workspace: Workspace
  span: Span
  commitId: number
  evaluationUuid: string
  error: Error
}) {
  try {
    if (!span.documentUuid) return

    const commitsRepository = new CommitsRepository(workspace.id)
    const commitResult = await commitsRepository.getCommitById(commitId)
    if (commitResult.error) {
      captureException(commitResult.error)
      return
    }
    const commit = commitResult.unwrap()

    const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
    const evaluationResult = await evaluationsRepository.getAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: span.documentUuid,
      evaluationUuid,
    })
    if (evaluationResult.error) {
      captureException(evaluationResult.error)
      return
    }
    const evaluation = evaluationResult.unwrap()

    const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
    const existing = await resultsRepository.findByEvaluatedSpanAndEvaluation({
      evaluatedSpanId: span.id,
      evaluatedTraceId: span.traceId,
      evaluationUuid,
    })
    if (existing) return

    const writeResult = await createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
      value: {
        error: { message: error.message },
      } as EvaluationResultValue,
    })
    if (writeResult.error) {
      captureException(writeResult.error)
    }
  } catch (recordingError) {
    captureException(recordingError as Error)
  }
}
