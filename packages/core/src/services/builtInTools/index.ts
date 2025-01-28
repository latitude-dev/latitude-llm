import { ChainStepResponse, StreamType } from '@latitude-data/constants'
import { BuiltInToolCall, LatitudeBuiltInToolName } from '../../constants'
import { runCode } from './runCode'
import {
  BadRequestError,
  LatitudeError,
  PromisedResult,
  Result,
} from '../../lib'

export function getBuiltInToolCallsFromResponse(
  response: ChainStepResponse<StreamType>,
): BuiltInToolCall[] {
  const toolCalls = (response as ChainStepResponse<'text'>).toolCalls ?? []
  const builtinToolCallNames = Object.values(LatitudeBuiltInToolName)
  return toolCalls.filter((toolCall) =>
    builtinToolCallNames.includes(toolCall.name as LatitudeBuiltInToolName),
  ) as BuiltInToolCall[]
}

const BUILT_IN_TOOL_METHODS: Record<LatitudeBuiltInToolName, Function> = {
  [LatitudeBuiltInToolName.RunCode]: runCode,
}

export async function executeBuiltInToolCall(
  toolCall: BuiltInToolCall,
): PromisedResult<unknown, LatitudeError> {
  const method = BUILT_IN_TOOL_METHODS[toolCall.name]
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
