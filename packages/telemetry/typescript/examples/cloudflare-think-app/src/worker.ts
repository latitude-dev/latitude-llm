import { createAnthropic } from "@ai-sdk/anthropic"
import { CodemodeRuntime } from "@cloudflare/codemode"
import { Think, type TurnConfig, type TurnContext } from "@cloudflare/think"
import { createExecuteTool } from "@cloudflare/think/tools/execute"
import { type ContextOptions, createCodemodeTelemetry, Latitude } from "@latitude-data/telemetry"
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

function createCodemodeTools(): ToolSet {
  return {
    getWeather: tool({
      description: "Get the current weather for a city.",
      inputSchema: z.object({
        city: z.string().describe("City to look up."),
      }),
      execute: async ({ city }) => getWeather(city),
    }),
    estimateTripBudget: tool({
      description: "Estimate a simple trip budget for a city.",
      inputSchema: z.object({
        city: z.string().describe("Destination city."),
        days: z.number().int().positive().describe("Trip length in days."),
        travelers: z.number().int().positive().default(1).describe("Number of travelers."),
      }),
      execute: async ({ city, days, travelers }) => estimateTripBudget(city, days, travelers),
    }),
    listCityHighlights: tool({
      description: "List deterministic city highlights for planning demos.",
      inputSchema: z.object({
        city: z.string().describe("City to summarize."),
      }),
      execute: async ({ city }) => listCityHighlights(city),
    }),
  }
}

export class MyAgent extends Think<Env> {
  private latitudeContext: ContextOptions | undefined

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
    const codemode = createCodemodeTelemetry({
      latitude: getLatitude(this.env),
      scope: "cloudflare-think-codemode",
      context: () => this.latitudeContext,
    })

    return {
      execute: codemode.wrapExecuteTool(
        createExecuteTool(this, {
          name: "travel-codemode",
          tools: codemode.traceToolSet(createCodemodeTools()),
        }),
      ),
    }
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
