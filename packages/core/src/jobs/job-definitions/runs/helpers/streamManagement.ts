import {
  ACTIVE_RUN_STREAM_CAP,
  ACTIVE_RUN_STREAM_KEY,
  ChainEvent,
  ChainEventTypes,
  humanizeTool,
  RUN_CAPTION_SIZE,
  StreamEventTypes,
} from '@latitude-data/constants'
import { env } from '@latitude-data/env'
import { RedisStream } from '../../../../lib/redisStream'
import { updateRun } from '../../../../services/runs/update'
import { RunIdentifiers } from './types'

type ForwardStreamEventsArgs = RunIdentifiers & {
  readStream: ReadableStream<ChainEvent>
  writeStream: RedisStream
}

/**
 * Forwards stream events from a readable stream to a Redis stream,
 * updating the run caption based on significant events.
 *
 * This function reads events from the document execution stream and:
 * 1. Writes each event to Redis for client consumption
 * 2. Updates the run caption for UI display based on event type
 */
export async function forwardStreamEvents({
  runUuid,
  readStream,
  writeStream,
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
}: ForwardStreamEventsArgs) {
  const reader = readStream.getReader()
  const GRACE_PERIOD_MS = env.KEEP_ALIVE_TIMEOUT

  try {
    while (true) {
      const timeoutPromise = new Promise<{ done: true; value?: undefined }>(
        (resolve) => setTimeout(() => resolve({ done: true }), GRACE_PERIOD_MS),
      )
      const readPromise = reader.read()
      const result = await Promise.race([readPromise, timeoutPromise])
      const { done, value: event } = result
      if (done) break

      await writeStream.write(event)
      await updateRunCaption({
        runUuid,
        event,
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
      })
    }
  } finally {
    reader.releaseLock()
  }
}

type UpdateRunCaptionArgs = RunIdentifiers & {
  event: ChainEvent
}

/**
 * Updates the run caption based on the event type.
 * Captions are truncated to RUN_CAPTION_SIZE characters.
 */
async function updateRunCaption({
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
  event: { event, data },
}: UpdateRunCaptionArgs) {
  const caption = extractCaptionFromEvent(event, data)
  if (!caption) return

  await updateRun({
    workspaceId,
    projectId,
    documentUuid,
    commitUuid,
    runUuid,
    caption,
  })
}

/**
 * Extracts a human-readable caption from a chain event.
 * Returns an empty string if no caption should be shown.
 */
function extractCaptionFromEvent(
  event: ChainEvent['event'],
  data: ChainEvent['data'],
): string {
  let caption = ''

  if (event === StreamEventTypes.Provider) {
    switch (data.type) {
      case 'tool-call':
        caption = `Running ${humanizeTool(data.toolName)}...`
        break
      default:
        return ''
    }
  } else {
    switch (data.type) {
      case ChainEventTypes.ProviderCompleted:
        caption = data.response.text
        break
      case ChainEventTypes.ToolsStarted:
        caption = `Running ${data.tools.map((tool) => humanizeTool(tool.name)).join(', ')}...`
        break
      case ChainEventTypes.IntegrationWakingUp:
        caption = `Waking up ${data.integrationName} integration...`
        break
    }
  }

  return caption.trim().slice(0, RUN_CAPTION_SIZE)
}

export function createWriteStream(runUuid: string): RedisStream {
  return new RedisStream({
    key: ACTIVE_RUN_STREAM_KEY(runUuid),
    cap: ACTIVE_RUN_STREAM_CAP,
  })
}

export function createCancelHandler(
  jobId: string | undefined,
  abortController: AbortController,
): (args: { jobId: string }) => void {
  return ({ jobId: cancelledJobId }) => {
    if (cancelledJobId !== jobId) return
    abortController.abort()
  }
}
