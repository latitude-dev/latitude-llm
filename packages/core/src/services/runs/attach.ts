import { ChainEvent } from '@latitude-data/constants'
import {
  ChainError,
  LatitudeError,
  LatitudeErrorDto,
} from '@latitude-data/constants/errors'
import { Job, QueueEventsListener } from 'bullmq'
import { Project, Workspace } from '../../schema/types'
import { Run } from '@latitude-data/constants'
import { BackgroundRunJobResult } from '../../jobs/job-definitions/runs/backgroundRunJob'
import { queues } from '../../jobs/queues'
import { NotFoundError, UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { createPromiseWithResolver } from '../../lib/streamManager/utils/createPromiseResolver'
import { JOB_FINISHED_STATES, subscribeQueue } from './shared'
import { stopRun } from './stop'

export async function attachRun({
  run,
  project,
  workspace,
  abortSignal,
  onEvent,
}: {
  run: Run
  project: Project
  workspace: Workspace
  abortSignal?: AbortSignal
  onEvent?: (event: ChainEvent) => void
}) {
  const [promisedResponse, resolveResponse] = createPromiseWithResolver<BackgroundRunJobResult['lastResponse']>() // prettier-ignore
  const [promisedToolCalls, resolveToolCalls] = createPromiseWithResolver<BackgroundRunJobResult['toolCalls']>() // prettier-ignore
  const [promisedError, resolveError] = createPromiseWithResolver<LatitudeError | undefined>() // prettier-ignore

  if (run.endedAt) {
    return Result.error(new UnprocessableEntityError('Run already ended'))
  }

  const { runsQueue } = await queues()
  const job = await runsQueue.getJob(run.uuid)
  if (!job?.id) {
    return Result.error(
      new NotFoundError(`Active run job with uuid ${run.uuid} not found`),
    )
  }

  let idx = 0
  if (job.progress && onEvent) {
    idx = forwardEvents(job.progress, idx, onEvent)
  }

  const onProgress = ({
    jobId,
    data,
  }: Parameters<QueueEventsListener['progress']>[0]) => {
    if (jobId !== job.id) return

    if (data && onEvent) {
      idx = forwardEvents(data, idx, onEvent)
    }
  }

  const onCompleted = ({
    jobId,
    returnvalue,
  }: Parameters<QueueEventsListener['completed']>[0]) => {
    if (jobId !== job.id) return
    if (!returnvalue || typeof returnvalue !== 'string') return

    let result: BackgroundRunJobResult
    try {
      result = JSON.parse(returnvalue) as BackgroundRunJobResult
    } catch (error) {
      return onFailed({ jobId, failedReason: (error as Error).message })
    }

    resolveResponse(result.lastResponse)
    resolveToolCalls(result.toolCalls)
    resolveError(undefined)
  }

  const onFailed = ({
    jobId,
    failedReason,
  }: Parameters<QueueEventsListener['failed']>[0]) => {
    if (jobId !== job.id) return
    if (!failedReason || typeof failedReason !== 'string') return

    let error: LatitudeError
    try {
      const json = JSON.parse(failedReason) as LatitudeErrorDto
      if (json.name === ChainError.name) {
        error = ChainError.deserialize(json)
      } else {
        error = LatitudeError.deserialize(json)
      }
    } catch {
      error = new LatitudeError(failedReason)
    }

    resolveResponse(undefined)
    resolveToolCalls([])
    resolveError(error)
  }

  const state = await job.getState()
  if (JOB_FINISHED_STATES.includes(state)) {
    if (state === 'completed') {
      onCompleted({ jobId: job.id, returnvalue: job.returnvalue })
    } else {
      onFailed({ jobId: job.id, failedReason: job.failedReason })
    }
  } else {
    const onAborted = () => stopRun({ run, project, workspace })
    if (abortSignal?.aborted) onAborted()
    else abortSignal?.addEventListener('abort', onAborted, { once: true })

    const subscription = await subscribeQueue()
    subscription.on('progress', onProgress)
    subscription.on('completed', onCompleted)
    subscription.on('failed', onFailed)
    promisedError.then(() => {
      subscription
        .off('progress', onProgress)
        .off('completed', onCompleted)
        .off('failed', onFailed)

      abortSignal?.removeEventListener('abort', onAborted)
    })
  }

  return Result.ok({
    lastResponse: promisedResponse,
    toolCalls: promisedToolCalls,
    error: promisedError,
  })
}

// TODO(runs): defend to possible data race?
function forwardEvents(
  progress: Job['progress'],
  index: number,
  onEvent: (event: ChainEvent) => void,
) {
  if (!progress) return index
  if (typeof progress !== 'object') return index
  if (!Array.isArray(progress)) return index

  for (let i = index; i < progress.length; i++) {
    onEvent?.(progress[i] as ChainEvent)
  }

  return progress.length
}
