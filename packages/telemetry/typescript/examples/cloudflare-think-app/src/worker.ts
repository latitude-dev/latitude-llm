import { createAnthropic } from "@ai-sdk/anthropic"
import { CodemodeRuntime } from "@cloudflare/codemode"
import { Think, type TurnConfig, type TurnContext } from "@cloudflare/think"
import { createExecuteTool } from "@cloudflare/think/tools/execute"
import { type ContextOptions, Latitude } from "@latitude-data/telemetry"
import { type Context as OtelContext, context as otelContext, SpanStatusCode, trace } from "@opentelemetry/api"
import { routeAgentRequest } from "agents"
import { type ToolSet, tool } from "ai"
import { z } from "zod"

export { CodemodeRuntime }

type Env = {
  LOADER: WorkerLoader
  MyAgent: DurableObjectNamespace<MyAgent>
  LATITUDE_API_KEY: string
  LATITUDE_PROJECT_SLUG: string
  LATITUDE_TELEMETRY_URL?: string
  ANTHROPIC_API_KEY: string
}

type CodemodeTraceState = {
  parentContext?: OtelContext
  latitudeContext?: ContextOptions
}

let latitude: Latitude | undefined

function getLatitude(env: Env) {
  if (env.LATITUDE_TELEMETRY_URL) {
    process.env.LATITUDE_TELEMETRY_URL = env.LATITUDE_TELEMETRY_URL
  }

  latitude ??= new Latitude({
    apiKey: env.LATITUDE_API_KEY,
    project: env.LATITUDE_PROJECT_SLUG,
    serviceName: "cloudflare-think-agent",
  })

  return latitude
}

function getAnthropicModel(apiKey: string) {
  return createAnthropic({ apiKey })("claude-sonnet-4-5")
}

function stringFromBody(body: Record<string, unknown> | undefined, key: string) {
  const value = body?.[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function contextFromTurn(env: Env, ctx: TurnContext): ContextOptions {
  return {
    userId: stringFromBody(ctx.body, "userId"),
    sessionId: stringFromBody(ctx.body, "sessionId"),
    project: env.LATITUDE_PROJECT_SLUG,
    tags: ["cloudflare-think"],
    metadata: { framework: "cloudflare-think", continuation: ctx.continuation },
  }
}

function latitudeSpanAttributes(context: ContextOptions | undefined) {
  return {
    ...(context?.sessionId ? { "session.id": context.sessionId } : {}),
    ...(context?.userId ? { "user.id": context.userId } : {}),
    ...(context?.userEmail ? { "user.email": context.userEmail } : {}),
    ...(context?.project ? { "latitude.project": context.project } : {}),
    ...(context?.tags ? { "latitude.tags": JSON.stringify(context.tags) } : {}),
    ...(context?.metadata ? { "latitude.metadata": JSON.stringify(context.metadata) } : {}),
  }
}

function stringifyToolValue(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function withCodemodeTraceContext<T>(
  state: CodemodeTraceState,
  latitudeContext: ContextOptions | undefined,
  run: () => Promise<T>,
) {
  const previousParentContext = state.parentContext
  const previousLatitudeContext = state.latitudeContext
  state.parentContext = otelContext.active()
  state.latitudeContext = latitudeContext

  try {
    return await run()
  } finally {
    state.parentContext = previousParentContext
    state.latitudeContext = previousLatitudeContext
  }
}

async function traceCodemodeTool<TInput, TOutput>(
  env: Env,
  state: CodemodeTraceState,
  name: string,
  input: TInput,
  execute: () => Promise<TOutput>,
) {
  const toolCallId = `codemode-${name}-${crypto.randomUUID()}`
  const inputJson = stringifyToolValue(input)
  const parentContext = state.parentContext ?? otelContext.active()
  const span = getLatitude(env)
    .getTracer("cloudflare-think-codemode")
    .startSpan(
      `ai.toolCall ${name}`,
      {
        attributes: {
          ...latitudeSpanAttributes(state.latitudeContext),
          "ai.operationId": "ai.toolCall",
          "ai.toolCall.name": name,
          "ai.toolCall.id": toolCallId,
          "ai.toolCall.args": inputJson,
          "gen_ai.tool.name": name,
          "gen_ai.tool.call.id": toolCallId,
          "gen_ai.tool.call.arguments": inputJson,
        },
      },
      parentContext,
    )

  return otelContext.with(trace.setSpan(parentContext, span), async () => {
    try {
      const output = await execute()
      const outputJson = stringifyToolValue(output)
      span.setAttributes({
        "ai.toolCall.result": outputJson,
        "gen_ai.tool.call.result": outputJson,
      })
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

async function getWeather(city: string) {
  return {
    city,
    temperatureC: 21,
    conditions: "sunny",
  }
}

async function estimateTripBudget(city: string, days: number, travelers: number) {
  return {
    city,
    days,
    travelers,
    estimatedEur: days * travelers * 95,
  }
}

async function listCityHighlights(city: string) {
  return {
    city,
    highlights: ["old town walk", "local market", "sunset viewpoint"],
  }
}

function createCodemodeTools(env: Env, traceState: CodemodeTraceState): ToolSet {
  return {
    getWeather: tool({
      description: "Get the current weather for a city.",
      inputSchema: z.object({
        city: z.string().describe("City to look up."),
      }),
      execute: async (input) => traceCodemodeTool(env, traceState, "getWeather", input, () => getWeather(input.city)),
    }),
    estimateTripBudget: tool({
      description: "Estimate a simple trip budget for a city.",
      inputSchema: z.object({
        city: z.string().describe("Destination city."),
        days: z.number().int().positive().describe("Trip length in days."),
        travelers: z.number().int().positive().default(1).describe("Number of travelers."),
      }),
      execute: async (input) =>
        traceCodemodeTool(env, traceState, "estimateTripBudget", input, () =>
          estimateTripBudget(input.city, input.days, input.travelers),
        ),
    }),
    listCityHighlights: tool({
      description: "List deterministic city highlights for planning demos.",
      inputSchema: z.object({
        city: z.string().describe("City to summarize."),
      }),
      execute: async (input) =>
        traceCodemodeTool(env, traceState, "listCityHighlights", input, () => listCityHighlights(input.city)),
    }),
  }
}

type ExecutableTool = ReturnType<typeof createExecuteTool> & {
  execute?: (input: unknown, options: unknown) => Promise<unknown>
}

function createTracedExecuteTool(agent: MyAgent, env: Env, traceState: CodemodeTraceState) {
  const executeTool = createExecuteTool(agent, {
    name: "travel-codemode",
    tools: createCodemodeTools(env, traceState),
  }) as ExecutableTool
  const execute = executeTool.execute

  if (!execute) return executeTool

  return {
    ...executeTool,
    execute: async (input: unknown, options: unknown) =>
      withCodemodeTraceContext(traceState, agent.getLatitudeContext(), () => execute(input, options)),
  }
}

export class MyAgent extends Think<Env> {
  private latitudeContext: ContextOptions | undefined
  private readonly codemodeTraceState: CodemodeTraceState = {}

  getModel() {
    return getAnthropicModel(this.env.ANTHROPIC_API_KEY)
  }

  getSystemPrompt() {
    return [
      "You are a Cloudflare Think demo agent for Latitude telemetry.",
      "For requests about Barcelona, weather, budgets, highlights, planning, or tools, call the execute tool once.",
      "Inside execute, write TypeScript that calls tools.getWeather, tools.estimateTripBudget, and tools.listCityHighlights, then returns one object with those results.",
      "Do not print JSON tool-call examples in prose. Call the actual execute tool.",
      "After execute returns, summarize the returned object briefly.",
    ].join(" ")
  }

  getTools(): ToolSet {
    return {
      execute: createTracedExecuteTool(this, this.env, this.codemodeTraceState),
    }
  }

  getLatitudeContext() {
    return this.latitudeContext
  }

  beforeTurn(ctx: TurnContext): TurnConfig {
    this.latitudeContext = contextFromTurn(this.env, ctx)

    return {
      activeTools: ["execute"],
      maxSteps: 4,
      maxOutputTokens: 1200,
      chatStreamStallTimeoutMs: 60_000,
      experimental_telemetry: {
        isEnabled: true,
        tracer: getLatitude(this.env).getTracer("cloudflare-think", this.latitudeContext),
        functionId: "think-turn",
      },
    }
  }

  async onChatResponse() {
    await getLatitude(this.env).flush()
  }

  onChatError(error: unknown) {
    this.ctx.waitUntil(getLatitude(this.env).flush())
    return error
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
