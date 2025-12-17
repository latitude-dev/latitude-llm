import { LatitudeTool, ToolExecutionOptions } from '@latitude-data/constants'
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
  value: TResult | string
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
        value: (e as Error).message,
      }
    }
  }

  const $tool = telemetry.span.tool(
    {
      name: toolName,
      call: {
        id: toolCall.toolCallId,
        arguments: args,
      },
    },
    context,
  )

  try {
    const value = await executeFn(args, toolCall).then((r) => r.unwrap())
    $tool?.end({ result: { value, isError: false } })

    return {
      isError: false,
      value,
    }
  } catch (e) {
    const result = {
      value: (e as Error).message,
      isError: true,
    }

    $tool?.end({ result })

    return result
  }
}
