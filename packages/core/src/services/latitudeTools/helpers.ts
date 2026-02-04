import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { ToolModelMessage, Tool, ToolResultPart, JSONValue } from 'ai'
import { AssistantMessage } from 'promptl-ai'
import { LatitudeToolCall } from '../../constants'
import { TypedResult } from '../../lib/Result'
import { TelemetryContext } from '../../telemetry'
import { LATITUDE_TOOLS } from './tools'

export const getLatitudeToolName = (
  internalName: LatitudeToolInternalName,
): LatitudeTool => {
  const toolKey = Object.entries(LatitudeToolInternalName).find(
    ([_, val]) => val === internalName,
  )![0]!
  return LatitudeTool[toolKey as keyof typeof LatitudeTool]
}

export const getLatitudeToolInternalName = (
  tool: LatitudeTool,
): LatitudeToolInternalName => {
  const toolKey = Object.entries(LatitudeTool).find(
    ([_, val]) => val === tool,
  )![0]!
  return LatitudeToolInternalName[
    toolKey as keyof typeof LatitudeToolInternalName
  ]
}

export function getLatitudeToolCallsFromAssistantMessage(
  message: AssistantMessage,
): LatitudeToolCall[] {
  const toolCalls = message.toolCalls ?? []
  const builtinToolCallNames = Object.values(LatitudeToolInternalName)
  return Object.values(toolCalls).filter((toolCall) =>
    builtinToolCallNames.includes(toolCall.name as LatitudeToolInternalName),
  ) as LatitudeToolCall[]
}

export function getLatitudeToolDefinition(
  tool: LatitudeTool,
  context?: TelemetryContext,
): Tool | undefined {
  return LATITUDE_TOOLS.find((t) => t.name === tool)?.definition(context)
}

export function buildToolMessage({
  toolName,
  toolId,
  result,
}: {
  toolName: string
  toolId: string
  result: TypedResult<unknown, Error>
}): ToolModelMessage {
  let output: ToolResultPart['output']

  if (result.ok) {
    if (typeof result.value === 'string') {
      output = {
        type: 'text',
        value: result.value,
      }
    } else {
      output = {
        type: 'json',
        value: result.value as JSONValue,
      }
    }
  } else {
    output = {
      type: 'error-text',
      value: result.error?.message ?? 'Unknown error',
    }
  }
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolName: toolName,
        toolCallId: toolId,
        output,
      },
    ],
  }
}
