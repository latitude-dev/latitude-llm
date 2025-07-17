import { LatitudeTool } from '@latitude-data/constants'
import { ToolExecutionOptions } from 'ai'
import { TypedResult } from '../../lib/Result'
import { telemetry, TelemetryContext } from '../../telemetry'

export interface ToolCall {
  toolCallId: string
}

export async function withTelemetryWrapper<
  TArgs extends Record<string, unknown>,
  TResult,
>(
  executeFn: (
    args: TArgs,
    toolCall: ToolExecutionOptions,
  ) => Promise<TypedResult<TResult, Error>>,
  options: {
    toolName: LatitudeTool
    context?: TelemetryContext
    args: TArgs
    toolCall: ToolExecutionOptions
  },
): Promise<TResult> {
  const { toolName, context, args, toolCall } = options

  if (!context) {
    return executeFn(args, toolCall).then((r) => r.unwrap())
  }

  const $tool = telemetry.tool(context, {
    name: toolName,
    call: {
      id: toolCall.toolCallId,
      arguments: args,
    },
  })

  try {
    const value = await executeFn(args, toolCall).then((r) => r.unwrap())
    $tool?.end({ result: { value, isError: false } })
    return value
  } catch (e) {
    $tool?.fail(e as Error)
    throw e
  }
}
