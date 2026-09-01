import { createAnthropic } from "@ai-sdk/anthropic"
import { CodemodeRuntime } from "@cloudflare/codemode"
import { Think, type TurnConfig, type TurnContext } from "@cloudflare/think"
import { createExecuteTool } from "@cloudflare/think/tools/execute"
import { type ContextOptions, Latitude } from "@latitude-data/telemetry"
import {
  createCodemodeTelemetry,
  createDurableObjectTelemetry,
  injectTraceContext,
  type TraceContextCarrier,
  withTraceContext,
} from "@latitude-data/telemetry/cloudflare"
import { Agent, getAgentByName, routeAgentRequest } from "agents"
import { generateText, tool } from "ai"
import { z } from "zod"

export { CodemodeRuntime }

type Env = {
  LOADER: WorkerLoader
  MyAgent: DurableObjectNamespace<MyAgent>
  Planner: DurableObjectNamespace<Planner>
  LATITUDE_API_KEY: string
  LATITUDE_PROJECT_SLUG: string
  LATITUDE_TELEMETRY_URL?: string
  ANTHROPIC_API_KEY: string
}

let latitude: Latitude | undefined

function getLatitude(env: Env) {
  if (env.LATITUDE_TELEMETRY_URL) process.env.LATITUDE_TELEMETRY_URL = env.LATITUDE_TELEMETRY_URL

  latitude ??= new Latitude({
    apiKey: env.LATITUDE_API_KEY,
    project: env.LATITUDE_PROJECT_SLUG,
    serviceName: "cloudflare-think-agent",
  })

  return latitude
}

function getModel(env: Env) {
  return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })("claude-sonnet-4-5")
}

function latitudeContext(env: Env, ctx: TurnContext): ContextOptions {
  const body = (ctx.body ?? {}) as Record<string, unknown>

  return {
    userId: typeof body.userId === "string" ? body.userId : undefined,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    project: env.LATITUDE_PROJECT_SLUG,
    tags: ["cloudflare-think"],
    metadata: { framework: "cloudflare-think", continuation: ctx.continuation },
  }
}

const travelTools = {
  getWeather: tool({
    description: "Get the current weather for a city.",
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => ({ city, temperatureC: 21, conditions: "sunny" }),
  }),
  estimateTripBudget: tool({
    description: "Estimate a trip budget for a city.",
    inputSchema: z.object({
      city: z.string(),
      days: z.number().int().positive(),
      travelers: z.number().int().positive().default(1),
    }),
    execute: async ({ city, days, travelers }) => ({ city, estimatedEur: days * travelers * 95 }),
  }),
  listCityHighlights: tool({
    description: "List city highlights.",
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => ({ city, highlights: ["old town walk", "local market", "sunset viewpoint"] }),
  }),
}

/** A second agent in its own Durable Object: separate isolate, separate memory, separate turn. */
export class Planner extends Agent<Env> {
  private telemetry = createDurableObjectTelemetry({ latitude: getLatitude(this.env), ctx: this.ctx })

  async draftItinerary(goal: string, trace?: TraceContextCarrier) {
    return this.telemetry.run(() =>
      withTraceContext(trace, async (remote) => {
        const result = await generateText({
          model: getModel(this.env),
          prompt: `Draft a two-day itinerary. Keep it to four lines. Goal: ${goal}`,
          experimental_telemetry: {
            isEnabled: true,
            tracer: remote.getTracer(getLatitude(this.env), "cloudflare-planner"),
            functionId: "planner-turn",
          },
        })

        return result.text
      }),
    )
  }
}

export class MyAgent extends Think<Env> {
  private context: ContextOptions | undefined
  private telemetry = createDurableObjectTelemetry({ latitude: getLatitude(this.env), ctx: this.ctx })

  getModel() {
    return getModel(this.env)
  }

  getSystemPrompt() {
    return [
      "Use execute once for travel planning.",
      "Do not inspect tool signatures.",
      "Inside execute, call tools.getWeather({ city }), tools.estimateTripBudget({ city, days, travelers }), and tools.listCityHighlights({ city }).",
      "Then call draftItinerary once with the trip goal, and summarize both results briefly.",
    ].join(" ")
  }

  getTools() {
    const codemode = createCodemodeTelemetry({
      latitude: getLatitude(this.env),
      scope: "cloudflare-think-codemode",
      context: () => this.context,
    })

    return {
      execute: codemode.wrapExecuteTool(
        createExecuteTool(this, {
          tools: codemode.traceToolSet(travelTools),
        }),
      ),
      draftItinerary: tool({
        description: "Ask the planner agent for a two-day itinerary.",
        inputSchema: z.object({ goal: z.string() }),
        execute: async ({ goal }) => {
          const planner = await getAgentByName(this.env.Planner, this.name)
          // Called from inside the tool's `execute`, so the planner's turn parents on this tool
          // call rather than starting a trace of its own.
          return planner.draftItinerary(goal, injectTraceContext(this.context))
        },
      }),
    }
  }

  beforeTurn(ctx: TurnContext): TurnConfig {
    this.context = latitudeContext(this.env, ctx)

    return {
      maxSteps: 6,
      experimental_telemetry: {
        isEnabled: true,
        tracer: getLatitude(this.env).getTracer("cloudflare-think", this.context),
        functionId: "think-turn",
      },
    }
  }

  async onChatResponse() {
    await this.telemetry.flush()
  }

  onChatError(error: unknown) {
    this.telemetry.flushSoon()
    return error
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
