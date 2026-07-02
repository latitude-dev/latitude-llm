import { SpanStatusCode, type Tracer } from "@opentelemetry/api"
import type { Tool, ToolSet } from "ai"

export type InstrumentCodemodeToolsOptions = {
  tracer: Tracer
  toolCallIdPrefix?: string
}

let toolCallIdCounter = 0

function newToolCallId(prefix: string, toolName: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? String(++toolCallIdCounter)
  return `${prefix}-${toolName}-${suffix}`
}

function wrapToolExecute(toolName: string, tool: Tool, tracer: Tracer, toolCallIdPrefix: string): Tool {
  const execute = tool.execute
  if (!execute) return tool

  return {
    ...tool,
    execute: async (input, options) => {
      const toolCallId = newToolCallId(toolCallIdPrefix, toolName)
      const argsJson = JSON.stringify(input)
      const span = tracer.startSpan(`ai.toolCall ${toolName}`)

      span.setAttributes({
        "ai.operationId": "ai.toolCall",
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": toolName,
        "ai.toolCall.name": toolName,
        "ai.toolCall.id": toolCallId,
        "gen_ai.tool.call.id": toolCallId,
        "ai.toolCall.args": argsJson,
        "gen_ai.tool.call.arguments": argsJson,
        "latitude.codemode.inner_tool": true,
      })

      try {
        const result = await execute(input, options)
        const resultJson = JSON.stringify(result)
        span.setAttributes({
          "ai.toolCall.result": resultJson,
          "gen_ai.tool.call.result": resultJson,
        })
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        span.recordException(err)
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
        throw error
      } finally {
        span.end()
      }
    },
  }
}

export function instrumentCodemodeTools<T extends ToolSet>(tools: T, options: InstrumentCodemodeToolsOptions): T {
  const prefix = options.toolCallIdPrefix ?? "codemode-inner"
  const wrapped = {} as Record<string, Tool>

  for (const [name, tool] of Object.entries(tools) as [string, Tool][]) {
    wrapped[name] = wrapToolExecute(name, tool, options.tracer, prefix)
  }

  return wrapped as T
}
