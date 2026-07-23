import { type Context as OtelContext, context as otelContext, SpanStatusCode, trace } from "@opentelemetry/api"
import type { Latitude } from "./init.ts"
import { latitudeAttributesFromContext } from "./tracer.ts"
import type { ContextOptions } from "./types.ts"

type MaybePromise<T> = T | Promise<T>
type ToolExecute = (...args: unknown[]) => unknown

type TraceableTool = {
  readonly execute: ToolExecute
}

type CodemodeToolTraceInfo = {
  readonly toolName: string
  readonly phase: "input" | "output"
}

export type CodemodeTelemetryOptions = {
  readonly latitude: Latitude
  readonly scope?: string
  readonly context?: ContextOptions | (() => ContextOptions | undefined)
  readonly capture?: {
    readonly inputs?: boolean
    readonly outputs?: boolean
  }
  readonly redact?: (value: unknown, info: CodemodeToolTraceInfo) => unknown
}

export type CodemodeTelemetry = {
  readonly runWithTraceContext: <T>(run: () => Promise<T>) => Promise<T>
  readonly traceToolCall: <TInput, TOutput>(options: {
    readonly name: string
    readonly input: TInput
    readonly execute: () => MaybePromise<TOutput>
  }) => Promise<TOutput>
  readonly traceToolSet: <TTools extends Record<string, unknown>>(tools: TTools) => TTools
  readonly wrapExecuteTool: <TTool>(tool: TTool) => TTool
}

type TraceState = {
  parentContext: OtelContext
  latitudeContext: ContextOptions | undefined
}

function resolveTraceState(states: ReadonlySet<TraceState>, activeContext: OtelContext) {
  if (states.size === 1) return states.values().next().value

  const activeSpanContext = trace.getSpanContext(activeContext)
  if (!activeSpanContext) return undefined

  for (const state of states) {
    const parentSpanContext = trace.getSpanContext(state.parentContext)
    if (
      parentSpanContext?.traceId === activeSpanContext.traceId &&
      parentSpanContext.spanId === activeSpanContext.spanId
    ) {
      return state
    }
  }

  return undefined
}

function isTraceableTool(value: unknown): value is TraceableTool {
  return typeof value === "object" && value !== null && "execute" in value && typeof value.execute === "function"
}

function stringifyAttribute(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function resolveContext(context: CodemodeTelemetryOptions["context"]) {
  return typeof context === "function" ? context() : context
}

function toolCallAttributes(options: {
  readonly toolName: string
  readonly toolCallId: string
  readonly input: unknown
  readonly output: unknown
  readonly context: ContextOptions | undefined
  readonly captureInputs: boolean
  readonly captureOutputs: boolean
  readonly redact: (value: unknown, info: CodemodeToolTraceInfo) => unknown
}) {
  const input = options.redact(options.input, { toolName: options.toolName, phase: "input" })
  const output = options.redact(options.output, { toolName: options.toolName, phase: "output" })

  return {
    ...latitudeAttributesFromContext(options.context ?? {}),
    "ai.operationId": "ai.toolCall",
    "ai.toolCall.name": options.toolName,
    "ai.toolCall.id": options.toolCallId,
    "gen_ai.tool.name": options.toolName,
    "gen_ai.tool.call.id": options.toolCallId,
    ...(options.captureInputs
      ? {
          "ai.toolCall.args": stringifyAttribute(input),
          "gen_ai.tool.call.arguments": stringifyAttribute(input),
        }
      : {}),
    ...(options.captureOutputs
      ? {
          "ai.toolCall.result": stringifyAttribute(output),
          "gen_ai.tool.call.result": stringifyAttribute(output),
        }
      : {}),
  }
}

export function createCodemodeTelemetry(options: CodemodeTelemetryOptions): CodemodeTelemetry {
  const scope = options.scope ?? "codemode"
  const captureInputs = options.capture?.inputs ?? true
  const captureOutputs = options.capture?.outputs ?? true
  const redact = options.redact ?? ((value: unknown) => value)
  const activeStates = new Set<TraceState>()

  const runWithTraceContext = async <T>(run: () => Promise<T>) => {
    const state: TraceState = {
      parentContext: otelContext.active(),
      latitudeContext: resolveContext(options.context),
    }
    activeStates.add(state)

    try {
      return await run()
    } finally {
      activeStates.delete(state)
    }
  }

  const traceToolCall: CodemodeTelemetry["traceToolCall"] = async ({ name, input, execute }) => {
    const activeContext = otelContext.active()
    const state = resolveTraceState(activeStates, activeContext)

    // Codemode callbacks have no execution id, so ambiguous concurrent calls cannot be correlated safely.
    if (activeStates.size > 1 && !state) return await execute()

    const toolCallId = `codemode-${name}-${crypto.randomUUID()}`
    const parentContext = state?.parentContext ?? activeContext
    const latitudeContext = state ? state.latitudeContext : resolveContext(options.context)
    const span = options.latitude.getTracer(scope).startSpan(
      `ai.toolCall ${name}`,
      {
        attributes: toolCallAttributes({
          toolName: name,
          toolCallId,
          input,
          output: undefined,
          context: latitudeContext,
          captureInputs,
          captureOutputs: false,
          redact,
        }),
      },
      parentContext,
    )

    return otelContext.with(trace.setSpan(parentContext, span), async () => {
      try {
        const output = await execute()
        span.setAttributes(
          toolCallAttributes({
            toolName: name,
            toolCallId,
            input,
            output,
            context: latitudeContext,
            captureInputs: false,
            captureOutputs,
            redact,
          }),
        )
        return output
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) })
        throw error
      } finally {
        span.end()
      }
    })
  }

  const traceToolSet: CodemodeTelemetry["traceToolSet"] = (tools) => {
    const traced = { ...tools }

    for (const [name, tool] of Object.entries(tools)) {
      if (!isTraceableTool(tool)) continue
      const execute = tool.execute
      traced[name as keyof typeof traced] = {
        ...tool,
        execute: (...args: unknown[]) => traceToolCall({ name, input: args[0], execute: () => execute(...args) }),
      } as (typeof traced)[keyof typeof traced]
    }

    return traced
  }

  const wrapExecuteTool: CodemodeTelemetry["wrapExecuteTool"] = (tool) => {
    if (!isTraceableTool(tool)) return tool
    const execute = tool.execute

    return {
      ...tool,
      execute: (...args: unknown[]) => runWithTraceContext(() => Promise.resolve(execute(...args))),
    } as typeof tool
  }

  return { runWithTraceContext, traceToolCall, traceToolSet, wrapExecuteTool }
}
