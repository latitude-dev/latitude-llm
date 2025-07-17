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
): Promise<{
  isError: boolean
  value: TResult | Error
}> {
  const { toolName, context, args, toolCall } = options

  if (!context) {
    try {
      const value = await executeFn(args, toolCall).then((r) => r.unwrap())

      return {
        isError: false,
        value,
      }
    } catch (e) {
      return {
        isError: true,
        value: e as Error,
      }
    }
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

    return {
      isError: false,
      value,
    }
  } catch (e) {
    const result = {
      value: e as Error,
      isError: true,
    }

    $tool?.end({ result })

    return result
  }
}
