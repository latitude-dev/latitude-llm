import {
  ChainEvent,
  ChainEventTypes,
  LogSources,
  RUN_CAPTION_SIZE,
  StreamEventTypes,
} from '@latitude-data/constants'
import { Job } from 'bullmq'
import { publisher } from '../../../events/publisher'
import { LatitudeError } from '../../../lib/errors'
import { OkType } from '../../../lib/Result'
import {
  awaitClientToolResult,
  type ToolHandler,
} from '../../../lib/streamManager/clientTools/handlers'
import { RunsRepository } from '../../../repositories'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { BACKGROUND } from '../../../telemetry'
import { getDataForInitialRequest } from '../documents/runDocumentAtCommitWithAutoToolResponses/getDataForInitialRequest'

export type BackgroundRunJobData = {
  workspaceId: number
  projectId: number
  commitUuid: string
  documentUuid: string
  runUuid: string
  parameters?: Record<string, unknown>
  customIdentifier?: string
  tools?: string[]
  userMessage?: string
  source?: LogSources
}

export type BackgroundRunJobResult = {
  lastResponse: Awaited<OkType<typeof runDocumentAtCommit>['lastResponse']>
  toolCalls: Awaited<OkType<typeof runDocumentAtCommit>['toolCalls']>
}

export const backgroundRunJob = async (
  job: Job<BackgroundRunJobData, BackgroundRunJobResult>,
) => {
  const {
    workspaceId,
    projectId,
    commitUuid,
    documentUuid,
    runUuid,
    parameters = {},
    customIdentifier,
    tools = [],
    userMessage,
    source = LogSources.API,
  } = job.data

  const abortController = new AbortController()
  const onAborted = ({ jobId }: { jobId: string }) => {
    if (jobId !== job.id) return
    abortController.abort()
  }

  const repository = new RunsRepository(workspaceId, projectId)

  try {
    const { workspace, document, commit } = await getDataForInitialRequest({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    await repository
      .update({ runUuid, startedAt: new Date() })
      .then((r) => r.unwrap())
    await publisher.publishLater({
      type: 'runStarted',
      data: { runUuid, projectId, workspaceId },
    })

    publisher.subscribe('cancelJob', onAborted)

    const result = await runDocumentAtCommit({
      workspace,
      document,
      commit,
      errorableUuid: runUuid,
      parameters,
      customIdentifier,
      source,
      abortSignal: abortController.signal,
      context: BACKGROUND({ workspaceId }),
      tools: buildClientToolHandlersMap(tools),
      userMessage,
    }).then((r) => r.unwrap())

    forwardStreamEvents(
      { workspaceId, projectId, runUuid, stream: result.stream, job, repository }, // prettier-ignore
    )

    // Note: wait for the stream to finish
    const error = await result.error
    if (error) throw error

    return JSON.stringify({
      lastResponse: await result.lastResponse,
      toolCalls: await result.toolCalls,
    })
  } catch (error) {
    if (error instanceof LatitudeError) {
      throw new Error(JSON.stringify(error.serialize()))
    }

    throw error
  } finally {
    publisher.unsubscribe('cancelJob', onAborted)

    await repository.delete({ runUuid }).then((r) => r.unwrap())
    await publisher.publishLater({
      type: 'runEnded',
      data: { runUuid, projectId, workspaceId },
    })
  }
}

function buildClientToolHandlersMap(tools: string[]) {
  return tools.reduce((acc: Record<string, ToolHandler>, toolName: string) => {
    acc[toolName] = awaitClientToolResult
    return acc
  }, {})
}

async function forwardStreamEvents({
  stream,
  job,
  ...rest
}: {
  workspaceId: number
  projectId: number
  runUuid: string
  stream: ReadableStream<ChainEvent>
  job: Job<BackgroundRunJobData, BackgroundRunJobResult>
  repository: RunsRepository
}) {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value: event } = await reader.read()
      if (done) break

      // TODO(runs): check whether this scales well
      const progress = (job.progress || []) as ChainEvent[]
      job.updateProgress([...progress, event])

      await forwardRunCaption({ ...rest, event })
    }
  } finally {
    reader.releaseLock()
  }
}

async function forwardRunCaption({
  workspaceId,
  projectId,
  runUuid,
  repository,
  event: { event, data },
}: {
  workspaceId: number
  projectId: number
  runUuid: string
  repository: RunsRepository
  event: ChainEvent
}) {
  let caption = ''
  if (event === StreamEventTypes.Provider) {
    switch (data.type) {
      case 'tool-call':
        caption = `Running ${data.toolName} tool...`
        break
      default:
        return
    }
  } else {
    switch (data.type) {
      case ChainEventTypes.ProviderCompleted:
        caption = data.response.text
        break
      case ChainEventTypes.ToolsStarted:
        caption = `Running ${data.tools.map((tool) => tool.name).join(', ')} ${data.tools.length > 1 ? 'tools' : 'tool'}...`
        break
      case ChainEventTypes.IntegrationWakingUp:
        caption = `Waking up ${data.integrationName} integration...`
        break
    }
  }

  caption = caption.trim().slice(0, RUN_CAPTION_SIZE)
  if (!caption) return

  await repository.update({ runUuid, caption }).then((r) => r.unwrap())
  await publisher.publishLater({
    type: 'runStarted',
    data: { runUuid, projectId, workspaceId },
  })
}
