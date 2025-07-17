import {
  ChainStepObjectResponse,
  LogSources,
  ToolDefinition,
} from '@latitude-data/constants'
import { ToolExecutionOptions } from 'ai'
import { publisher } from '../../../events/publisher'
import { getCopilotDataForGenerateToolResponses } from '../../../jobs/job-definitions/documents/runDocumentAtCommitWithAutoToolResponses/getCopilotData'
import { runDocumentAtCommit } from '../../../services/commits'
import { TelemetryContext } from '../../../telemetry'
import { ChainError, RunErrorCodes } from '../../errors'

const TIMEOUT_CLIENT_TOOL_CALL = 5 * 60 * 1000 // 5 minutes

export type ToolHandlerProps = {
  toolDefinition: ToolDefinition
  toolCall: ToolExecutionOptions
  context: TelemetryContext
  args: Record<string, unknown>
}

export type ToolHandler = (props: ToolHandlerProps) => Promise<any>

export async function mockClientToolResult({
  toolDefinition,
  context,
  args,
}: ToolHandlerProps) {
  const copilot = await getCopilotDataForGenerateToolResponses().then((r) =>
    r.unwrap(),
  )

  const { response } = await runDocumentAtCommit({
    context,
    commit: copilot.commit,
    document: copilot.document,
    workspace: copilot.workspace,
    source: LogSources.Copilot,
    parameters: {
      parameters: args,
      toolDefinition,
    },
  }).then((r) => r.unwrap())

  const res = (await response) as ChainStepObjectResponse
  const { isError, result } = res.object
  if (isError) {
    throw new ChainError({
      message: result,
      code: RunErrorCodes.ErrorGeneratingMockToolResult,
    })
  }

  return res.object
}

export function awaitClientToolResult({ toolCall }: ToolHandlerProps) {
  return new Promise((resolve, reject) => {
    const listener = ({
      toolCallId,
      result,
      isError = 'false',
    }: {
      toolCallId: string
      result: unknown
      isError?: string
    }) => {
      if (toolCall.toolCallId !== toolCallId) return
      if (isError === 'true') {
        const error = new ChainError({
          code: RunErrorCodes.AIRunError,
          message:
            typeof result === 'string' ? result : 'Tool execution failed',
        })

        reject(error)
      } else {
        resolve(result)
      }
    }

    // Subscribe to event
    publisher.subscribe('clientToolResultReceived', listener)

    // Unsubscribe after timeout
    setTimeout(() => {
      publisher.unsubscribe('clientToolResultReceived', listener)
      const error = new ChainError({
        code: RunErrorCodes.AIRunError,
        message: 'Timeout waiting for client to respond to a tool call',
      })

      reject(error)
    }, TIMEOUT_CLIENT_TOOL_CALL) // 5 minutes
  })
}
