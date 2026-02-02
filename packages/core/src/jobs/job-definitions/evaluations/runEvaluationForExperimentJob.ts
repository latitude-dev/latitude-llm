import { DelayedError, Job } from 'bullmq'
import { SpanType } from '../../../constants'
import { SpansRepository } from '../../../repositories/spansRepository'
import { ExperimentsRepository } from '../../../repositories'
import { updateExperimentStatus } from '../../../services/experiments/updateStatus'
import { captureException } from '../../../utils/datadogCapture'
import { queues } from '../../queues'
import {
  runEvaluationV2JobKey,
  RunEvaluationV2JobData,
} from './runEvaluationV2Job'
import { LatitudeError } from '@latitude-data/constants/errors'

export type RunEvaluationForExperimentJobData = {
  workspaceId: number
  conversationUuid: string
  experimentUuid: string
  evaluationUuid: string
  commitId: number
  datasetId?: number
  datasetLabel?: string
  datasetRowId?: number
}

const INITIAL_DELAY_MS = 1000
const MAX_ATTEMPTS = 120

/**
 * Wait for trace and span to appear, then enqueue evaluation job
 * Retries with exponential backoff for up to ~2 minutes before marking as error
 */
export async function runEvaluationForExperimentJob(
  job: Job<RunEvaluationForExperimentJobData>,
  token?: string,
) {
  const { conversationUuid, workspaceId, experimentUuid, ...rest } = job.data

  const experimentsRepository = new ExperimentsRepository(workspaceId)
  const experiment = await experimentsRepository
    .findByUuid(experimentUuid)
    .then((r) => r.unwrap())

  if (experiment.finishedAt) return

  const spansRepo = new SpansRepository(workspaceId)

  const traceId = await spansRepo.getLastTraceByLogUuid(conversationUuid)
  if (!traceId) {
    if (shouldRetry(job.attemptsStarted)) {
      const delay = calculateExponentialBackoff(job.attemptsStarted)
      job.moveToDelayed(Date.now() + delay, token)
      throw new DelayedError('Waiting for trace to show up')
    }

    await markEvaluationAsError(workspaceId, experimentUuid, rest.datasetRowId)
    return
  }

  const spans = await spansRepo
    .list({ traceId })
    .then((r) => r.unwrap().filter((span) => span.type === SpanType.Prompt))
  const span = spans[0]
  if (!span) {
    if (shouldRetry(job.attemptsStarted)) {
      const delay = calculateExponentialBackoff(job.attemptsStarted)
      job.moveToDelayed(Date.now() + delay, token)
      throw new DelayedError('Waiting for span to show up')
    }

    await markEvaluationAsError(workspaceId, experimentUuid, rest.datasetRowId)
    return
  }

  const { evaluationsQueue } = await queues()
  const payload: RunEvaluationV2JobData = {
    workspaceId,
    spanId: span.id,
    traceId: span.traceId,
    experimentUuid,
    ...rest,
  }

  evaluationsQueue.add('runEvaluationV2Job', payload, {
    deduplication: { id: runEvaluationV2JobKey(payload) },
  })
}

/**
 * Update experiment status to mark evaluation as failed due to timeout
 */
async function markEvaluationAsError(
  workspaceId: number,
  experimentUuid: string,
  datasetRowId?: number,
) {
  try {
    const experimentsRepository = new ExperimentsRepository(workspaceId)
    const experiment = await experimentsRepository
      .findByUuid(experimentUuid)
      .then((r) => r.unwrap())
    if (!experiment) return

    const documentLogUuid = datasetRowId?.toString()
    if (!documentLogUuid) return

    await updateExperimentStatus(
      { workspaceId, experiment },
      (progressTracker) => progressTracker.evaluationError(documentLogUuid),
    ).then((r) => r.unwrap())
  } catch (error) {
    captureException(
      new LatitudeError(
        `[runEvaluationForExperimentJob] Failed to mark evaluation as error: ${error}`,
      ),
    )
  }
}

/**
 * Calculate exponential backoff delay with jitter
 * @param attempt - The attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
function calculateExponentialBackoff(attempt: number): number {
  const exponentialDelay = INITIAL_DELAY_MS * Math.pow(2, attempt)
  const jitter = exponentialDelay * 0.1 * (Math.random() - 0.5) * 2
  return exponentialDelay + jitter
}

/**
 * Check if we should retry based on attempt count
 * @param attemptsStarted - Number of attempts already made
 * @returns true if we should retry, false if we've exceeded max attempts
 */
function shouldRetry(attemptsStarted: number): boolean {
  return attemptsStarted < MAX_ATTEMPTS
}
