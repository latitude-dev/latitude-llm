import { ChainEvent, LogSources } from '@latitude-data/constants'
import { Job } from 'bullmq'
import { publisher } from '../../../events/publisher'
import { LatitudeError } from '../../../lib/errors'
import { OkType } from '../../../lib/Result'
import {
  awaitClientToolResult,
  type ToolHandler,
} from '../../../lib/streamManager/clientTools/handlers'
import {
  runDocumentAtCommitLegacy,
  type RunDocumentAtCommitLegacyArgs,
} from '../../../services/__deprecated/commits/runDocumentAtCommit'
import {
  runDocumentAtCommit,
  type RunDocumentAtCommitArgs,
} from '../../../services/commits/runDocumentAtCommit'
import { BACKGROUND } from '../../../telemetry'
import { getDataForInitialRequest } from './runDocumentAtCommitWithAutoToolResponses/getDataForInitialRequest'

export type RunDocumentApiJobData = {
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
  isLegacy: boolean
}

export type RunDocumentApiJobResult = {
  lastResponse: Awaited<OkType<typeof runDocumentAtCommit>['lastResponse']>
  toolCalls: Awaited<OkType<typeof runDocumentAtCommit>['toolCalls']>
}

function buildClientToolHandlersMap(tools: string[]) {
  return tools.reduce((acc: Record<string, ToolHandler>, toolName: string) => {
    acc[toolName] = awaitClientToolResult
    return acc
  }, {})
}

export const runDocumentApiJob = async (
  job: Job<RunDocumentApiJobData, RunDocumentApiJobResult>,
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
    isLegacy,
  } = job.data

  try {
    // Get the document and commit data
    const { workspace, document, commit } = await getDataForInitialRequest({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    // Build tool handlers map
    const toolHandlers = buildClientToolHandlersMap(tools)

    // Handle abort signal
    const abortController = new AbortController()
    publisher.subscribe('cancelJob', ({ jobId }: { jobId: string }) => {
      if (jobId !== job.id) return

      abortController.abort()
    })

    // Run the document
    const legacyArgs = {
      workspace,
      document,
      commit,
      errorableUuid: runUuid,
      parameters,
      customIdentifier,
      source,
      abortSignal: abortController.signal,
    }
    const result = await _runDocumentAtCommit(
      isLegacy
        ? {
            isLegacy: true,
            data: legacyArgs,
          }
        : {
            isLegacy: false,
            data: {
              ...legacyArgs,
              context: BACKGROUND({ workspaceId }),
              tools: toolHandlers,
              userMessage,
            },
          },
    ).then((r) => r.unwrap())

    // Broadcast stream events
    forwardStreamEvents(result.stream, job)

    // Wait for the stream to finish
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
  }
}

type RunDocumentArgs<T extends boolean> = T extends true
  ? { isLegacy: true; data: RunDocumentAtCommitLegacyArgs }
  : T extends false
    ? { isLegacy: false; data: RunDocumentAtCommitArgs }
    : never
async function _runDocumentAtCommit<T extends boolean>(
  args: RunDocumentArgs<T>,
) {
  const { isLegacy } = args

  if (isLegacy) {
    return runDocumentAtCommitLegacy(args.data)
  } else {
    return runDocumentAtCommit(args.data)
  }
}

async function forwardStreamEvents(
  stream: ReadableStream<ChainEvent>,
  job: Job<RunDocumentApiJobData, RunDocumentApiJobResult>,
) {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value: event } = await reader.read()
      if (done) break
      job.updateProgress(event)
    }
  } finally {
    reader.releaseLock()
  }
}
