import { ToolDefinition, ToolExecutionOptions } from '@latitude-data/constants'
import { publisher } from '../../../events/publisher'
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

export function buildClientToolHandlersMap(tools: string[]) {
  return tools.reduce((acc: Record<string, ToolHandler>, toolName: string) => {
    acc[toolName] = awaitClientToolResult
    return acc
  }, {})
}
