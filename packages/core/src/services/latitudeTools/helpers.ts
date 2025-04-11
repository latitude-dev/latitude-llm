import {
  AssistantMessage,
  ContentType,
  MessageRole,
  ToolMessage,
} from '@latitude-data/compiler'
import { LatitudeToolCall } from '../../constants'
import { LATITUDE_TOOLS } from './tools'
import {
  LatitudeTool,
  LatitudeToolInternalName,
  ToolDefinition,
} from '@latitude-data/constants'
import { TypedResult } from './../../lib/Result'

export const getLatitudeToolName = (
  internalName: LatitudeToolInternalName,
): LatitudeTool => {
  const toolKey = Object.entries(LatitudeToolInternalName).find(
    ([_, val]) => val === internalName,
  )?.[0]!
  return LatitudeTool[toolKey as keyof typeof LatitudeTool]
}

export const getLatitudeToolInternalName = (
  tool: LatitudeTool,
): LatitudeToolInternalName => {
  const toolKey = Object.entries(LatitudeTool).find(
    ([_, val]) => val === tool,
  )?.[0]!
  return LatitudeToolInternalName[
    toolKey as keyof typeof LatitudeToolInternalName
  ]
}

export function getLatitudeToolCallsFromAssistantMessage(
  message: AssistantMessage,
): LatitudeToolCall[] {
  const toolCalls = message.toolCalls ?? []
  const builtinToolCallNames = Object.values(LatitudeToolInternalName)
  return toolCalls.filter((toolCall) =>
    builtinToolCallNames.includes(toolCall.name as LatitudeToolInternalName),
  ) as LatitudeToolCall[]
}

export function getLatitudeToolDefinition(
  tool: LatitudeTool,
): ToolDefinition | undefined {
  return LATITUDE_TOOLS.find((t) => t.name === tool)?.definition
}

export function buildToolMessage({
  toolName,
  toolId,
  result,
}: {
  toolName: string
  toolId: string
  result: TypedResult<unknown, Error>
}): ToolMessage {
  return {
    role: MessageRole.tool,
    content: [
      {
        type: ContentType.toolResult,
        toolName: toolName,
        toolCallId: toolId,
        result: result.value ?? result.error?.message,
        isError: !result.ok,
      },
    ],
  }
}
