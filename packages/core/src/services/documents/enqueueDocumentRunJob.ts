import {
  ChainEvent,
  ChainEventTypes,
  LogSources,
  StreamEventTypes,
} from '@latitude-data/constants'
import {
  ChainError,
  LatitudeError,
  LatitudeErrorDto,
} from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { Job, Queue, QueueEvents, QueueEventsListener } from 'bullmq'
import { publisher } from '../../events/publisher'
import {
  RunDocumentApiJobData,
  RunDocumentApiJobResult,
} from '../../jobs/job-definitions/documents/runDocumentApiJob'
import { queues, Queues } from '../../jobs/queues'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result, TypedResult } from '../../lib/Result'
import { createPromiseWithResolver } from '../../lib/streamManager/utils/createPromiseResolver'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../../redis'

let _subscriber: QueueEvents | undefined
async function subscribe() {
  if (_subscriber) return _subscriber

  _subscriber = new QueueEvents(Queues.runsQueue, {
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
      maxRetriesPerRequest: 0,
    }),
  })

  return _subscriber
}

export type BackgroundRunResult = {
  lastResponse: Promise<RunDocumentApiJobResult['lastResponse']>
  toolCalls: Promise<RunDocumentApiJobResult['toolCalls']>
  error: Promise<LatitudeError | undefined>
}

export async function enqueueDocumentRunJob({
  workspaceId,
  projectId,
  commitUuid,
  documentUuid,
  parameters,
  customIdentifier,
  tools = [],
  userMessage,
  source = LogSources.API,
  isLegacy,
  abortSignal,
  onEvent,
}: {
  workspaceId: number
  projectId: number
  commitUuid: string
  documentUuid: string
  parameters?: Record<string, unknown>
  customIdentifier?: string
  tools?: string[]
  userMessage?: string
  source?: LogSources
  isLegacy: boolean
  abortSignal?: AbortSignal
  onEvent?: (event: ChainEvent) => void
}): Promise<
  TypedResult<{
    job: Job<RunDocumentApiJobData>
    queue: Queue
    result: BackgroundRunResult
  }>
> {
  const [promisedResponse, resolveResponse] = createPromiseWithResolver<Awaited<BackgroundRunResult['lastResponse']>>() // prettier-ignore
  const [promisedToolCalls, resolveToolCalls] = createPromiseWithResolver<Awaited<BackgroundRunResult['toolCalls']>>() // prettier-ignore
  const [promisedError, resolveError] = createPromiseWithResolver<Awaited<BackgroundRunResult['error']>>() // prettier-ignore

  const runUuid = generateUUIDIdentifier()

  const { runsQueue } = await queues()
  const job = await runsQueue.add(
    'runDocumentApiJob',
    {
      workspaceId,
      projectId,
      commitUuid,
      documentUuid,
      runUuid,
      parameters,
      customIdentifier,
      tools,
      userMessage,
      source,
      isLegacy,
    } satisfies RunDocumentApiJobData,
    { attempts: 1 },
  )
  if (!job.id) {
    return Result.error(new Error('Failed to enqueue document run job'))
  }

  abortSignal?.addEventListener(
    'abort',
    () => publisher.publish('cancelJob', { jobId: job.id }),
    { once: true },
  )

  onEvent?.({
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.RunQueued,
      jobId: job.id,
      messages: [],
      uuid: runUuid,
    },
  })

  const onProgress = ({
    jobId,
    data: event,
  }: Parameters<QueueEventsListener['progress']>[0]) => {
    if (jobId !== job.id) return
    if (!event || typeof event !== 'object') return

    onEvent?.(event as ChainEvent)
  }

  const onCompleted = ({
    jobId,
    returnvalue,
  }: Parameters<QueueEventsListener['completed']>[0]) => {
    if (jobId !== job.id) return
    if (!returnvalue || typeof returnvalue !== 'string') return

    let result: RunDocumentApiJobResult
    try {
      result = JSON.parse(returnvalue) as RunDocumentApiJobResult
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

  const subscription = await subscribe()
  subscription.on('progress', onProgress)
  subscription.on('completed', onCompleted)
  subscription.on('failed', onFailed)
  promisedError.then(() =>
    subscription
      .off('progress', onProgress)
      .off('completed', onCompleted)
      .off('failed', onFailed),
  )

  return Result.ok({
    job,
    queue: runsQueue,
    result: {
      lastResponse: promisedResponse,
      toolCalls: promisedToolCalls,
      error: promisedError,
    },
  })
}
