import {
  ACTIVE_RUN_STREAM_CAP,
  ACTIVE_RUN_STREAM_KEY,
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  LatitudeChainCompletedEventData,
  LatitudeChainErrorEventData,
  Run,
  StreamEventTypes,
  StreamType,
} from '@latitude-data/constants'
import { queues } from '../../jobs/queues'
import {
  ChainError,
  NotFoundError,
  RunErrorCodes,
  UnprocessableEntityError,
} from '../../lib/errors'
import { Result } from '../../lib/Result'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { RedisStream } from '../../lib/redisStream'
import { ToolCall } from '@latitude-data/constants/legacyCompiler'

export async function attachRun({
  run,
  abortSignal,
  onEvent,
}: {
  run: Run
  project: Project
  workspace: Workspace
  abortSignal?: AbortSignal
  onEvent?: (event: ChainEvent) => void
}) {
  if (run.endedAt) {
    return Result.error(new UnprocessableEntityError('Run already ended'))
  }
  let toolCalls: ToolCall[] = []
  let response: ChainStepResponse<StreamType> | undefined
  let error: ChainError<RunErrorCodes> | Error | undefined

  const { runsQueue } = await queues()
  const job = await runsQueue.getJob(run.uuid)
  // We only check for the job existence because the stream exists for a grace period after the job is completed (10 seconds)
  if (!job?.id) {
    return Result.error(
      new NotFoundError(
        `Active run job with uuid ${run.uuid} not found while attaching the run`,
      ),
    )
  }

  const onCompleted = (
    data: LatitudeChainCompletedEventData | LatitudeChainErrorEventData,
  ) => {
    if (data.type === ChainEventTypes.ChainCompleted) {
      response = data.response
      toolCalls = data.toolCalls
    } else {
      error = data.error
    }
  }

  await forwardStream({ run, onEvent, onCompleted, abortSignal })

  return Result.ok({
    lastResponse: response,
    toolCalls,
    error,
  })
}

async function forwardStream({
  run,
  onEvent,
  onCompleted,
  abortSignal,
}: {
  run: Run
  onEvent?: (event: ChainEvent) => void
  onCompleted: (
    event: LatitudeChainCompletedEventData | LatitudeChainErrorEventData,
  ) => void
  abortSignal?: AbortSignal
}) {
  const stream = new RedisStream({
    key: ACTIVE_RUN_STREAM_KEY(run.uuid),
    cap: ACTIVE_RUN_STREAM_CAP,
  })
  let lastId = '0-0'
  let done = false

  try {
    while (true) {
      if (done) break
      if (abortSignal?.aborted) break

      const data = await stream.read({ lastId, abortSignal })
      if (!data) continue

      for (const [eventId, fields] of data.result) {
        const event = JSON.parse(fields[1]) as ChainEvent

        onEvent?.(event)

        if (event.event === StreamEventTypes.Latitude) {
          if (
            event.data.type === ChainEventTypes.ChainCompleted ||
            event.data.type === ChainEventTypes.ChainError
          ) {
            onCompleted(event.data)
            done = true
            break
          }
        }

        lastId = eventId
      }
    }
  } finally {
    stream.close()
  }
}
