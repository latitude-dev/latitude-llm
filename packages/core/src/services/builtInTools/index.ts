import { BuiltInToolCall, LatitudeTool } from '../../constants'
import { runCode } from './runCode'
import {
  BadRequestError,
  LatitudeError,
  PromisedResult,
  Result,
  TypedResult,
} from '../../lib'
import { getLatitudeToolName, LatitudeToolInternalName } from './definitions'
import {
  AssistantMessage,
  ContentType,
  MessageRole,
  ToolMessage,
} from '@latitude-data/compiler'

export function getBuiltInToolCallsFromAssistantMessage(
  message: AssistantMessage,
): BuiltInToolCall[] {
  const toolCalls = message.toolCalls ?? []
  const builtinToolCallNames = Object.values(LatitudeToolInternalName)
  return toolCalls.filter((toolCall) =>
    builtinToolCallNames.includes(toolCall.name as LatitudeToolInternalName),
  ) as BuiltInToolCall[]
}

const BUILT_IN_TOOL_METHODS: Record<LatitudeTool, Function> = {
  [LatitudeTool.RunCode]: runCode,
}

export async function executeBuiltInToolCall(
  toolCall: BuiltInToolCall,
): PromisedResult<unknown, LatitudeError> {
  const toolName = getLatitudeToolName(toolCall.name)
  const method = BUILT_IN_TOOL_METHODS[toolName]
  if (!method) {
    return Result.error(
      new BadRequestError(`Unsupported built-in tool: ${toolCall.name}`),
    )
  }

  try {
    return await method(toolCall.arguments)
  } catch (error) {
    return Result.error(error as LatitudeError)
  }
}

export function buildToolMessage({
  toolName,
  toolId,
  result,
}: {
  toolName: LatitudeToolInternalName
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
