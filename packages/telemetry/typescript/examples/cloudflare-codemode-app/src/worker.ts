import { trace } from "@opentelemetry/api"
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat"
import { DynamicWorkerExecutor } from "@cloudflare/codemode"
import { createCodeTool } from "@cloudflare/codemode/ai"
import { Latitude, withLatitudeAttributes } from "@latitude-data/telemetry"
import { instrumentCodemodeTools } from "@latitude-data/telemetry/cloudflare"
import { routeAgentRequest } from "agents"
import { convertToModelMessages, streamText, tool, type ToolSet } from "ai"
import type { StreamTextOnFinishCallback } from "ai"
import { createWorkersAI } from "workers-ai-provider"
import { z } from "zod"
import { latestUserText, shouldRunCodemodeOrchestration } from "./codemode-code"
import { runCodemodePlan } from "./run-codemode-plan"

type Env = {
  AI: Ai
  LOADER: WorkerLoader
  MyAgent: DurableObjectNamespace<MyAgent>
  WeatherResearchAgent: DurableObjectNamespace<WeatherResearchAgent>
  LATITUDE_API_KEY: string
  LATITUDE_PROJECT_SLUG: string
  LATITUDE_TELEMETRY_URL?: string
}

type ParentContext = {
  userId?: string
  sessionId?: string
  runId?: string
}

const CODEMODE_ATTRIBUTES = {
  phase: "latitude.codemode.phase",
  turnId: "latitude.codemode.turn_id",
} as const

const AGENT_TOOL_ATTRIBUTES = {
  parentToolCallId: "latitude.agent_tool.parent_tool_call_id",
  runId: "latitude.agent_tool.run_id",
} as const

function codemodeTurnId(sessionId: string | undefined, turnIndex = 0) {
  return `${sessionId ?? "session"}:${turnIndex}`
}

type ResearchAgentInput = {
  cities: string[]
  focus?: string
  sessionId?: string
  userId?: string
}

const CHAT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"

const CITY_DIRECTORY: Record<string, { displayName: string; country: string; timezone: string }> = {
  barcelona: { displayName: "Barcelona", country: "Spain", timezone: "Europe/Madrid" },
  paris: { displayName: "Paris", country: "France", timezone: "Europe/Paris" },
  london: { displayName: "London", country: "United Kingdom", timezone: "Europe/London" },
  berlin: { displayName: "Berlin", country: "Germany", timezone: "Europe/Berlin" },
}

const WEATHER_BY_CITY: Record<string, { temperatureC: number; conditions: string; humidity: number; windKph: number }> =
  {
    barcelona: { temperatureC: 21, conditions: "sunny", humidity: 55, windKph: 12 },
    paris: { temperatureC: 16, conditions: "cloudy", humidity: 68, windKph: 18 },
    london: { temperatureC: 14, conditions: "light rain", humidity: 74, windKph: 22 },
    berlin: { temperatureC: 18, conditions: "partly cloudy", humidity: 61, windKph: 15 },
  }

function normalizeCity(city: string) {
  return city.trim().toLowerCase()
}

function resolveCity(city: string) {
  const key = normalizeCity(city)
  const entry = CITY_DIRECTORY[key]
  const weather = WEATHER_BY_CITY[key]
  if (!entry || !weather) return null
  return { key, ...entry, ...weather }
}

let latitude: Latitude | undefined

function getLatitude(env: Env) {
  latitude ??= new Latitude({
    apiKey: env.LATITUDE_API_KEY,
    project: env.LATITUDE_PROJECT_SLUG,
    serviceName: "cloudflare-codemode-agent",
    disableBatch: true,
    ...(env.LATITUDE_TELEMETRY_URL ? { telemetryUrl: env.LATITUDE_TELEMETRY_URL } : {}),
  })

  return latitude
}

function stringFromBody(body: Record<string, unknown> | undefined, key: string) {
  const value = body?.[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function workersModel(env: Env) {
  return createWorkersAI({ binding: env.AI })(CHAT_MODEL)
}

const lookupCity = tool({
  description: "Normalize a city name and return coordinates metadata for planning.",
  inputSchema: z.object({
    city: z.string().describe("City name, e.g. Barcelona."),
  }),
  execute: async ({ city }) => {
    const resolved = resolveCity(city)
    if (!resolved) {
      return { found: false as const, city, message: `Unknown city "${city}". Try Barcelona, Paris, London, or Berlin.` }
    }
    return {
      found: true as const,
      key: resolved.key,
      displayName: resolved.displayName,
      country: resolved.country,
      timezone: resolved.timezone,
    }
  },
})

const getWeather = tool({
  description: "Get a quick weather snapshot for a known city.",
  inputSchema: z.object({
    city: z.string().describe("City to look up."),
  }),
  execute: async ({ city }) => {
    const resolved = resolveCity(city)
    if (!resolved) return { city, error: "City not in directory" }
    return {
      city: resolved.displayName,
      temperatureC: resolved.temperatureC,
      conditions: resolved.conditions,
    }
  },
})

const getWeatherDetail = tool({
  description: "Detailed weather reading for a supported city.",
  inputSchema: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => {
    const resolved = resolveCity(city)
    if (!resolved) return { city, error: "City not in directory" }
    return {
      city: resolved.displayName,
      country: resolved.country,
      timezone: resolved.timezone,
      temperatureC: resolved.temperatureC,
      conditions: resolved.conditions,
      humidity: resolved.humidity,
      windKph: resolved.windKph,
    }
  },
})

function comfortForWeather(
  city: string,
  temperatureC: number,
  conditions: string,
  humidity = 50,
  windKph = 10,
) {
  let score = 7
  if (temperatureC < 10 || temperatureC > 30) score -= 2
  if (conditions.toLowerCase().includes("rain")) score -= 2
  if (humidity > 75) score -= 1
  if (windKph > 25) score -= 1
  if (conditions.toLowerCase().includes("sun")) score += 1
  score = Math.max(1, Math.min(10, score))
  return {
    city,
    comfortScore: score,
    verdict: score >= 7 ? "great for walking around" : score >= 5 ? "acceptable with layers" : "consider indoor plans",
  }
}

function cityBriefEntry(city: string) {
  const resolved = resolveCity(city)
  if (!resolved) return null
  const comfort = comfortForWeather(
    resolved.displayName,
    resolved.temperatureC,
    resolved.conditions,
    resolved.humidity,
    resolved.windKph,
  )
  return {
    name: resolved.displayName,
    temperatureC: resolved.temperatureC,
    conditions: resolved.conditions,
    comfortScore: comfort.comfortScore,
    notes: comfort.verdict,
  }
}

function cityBriefEntries(cities: string[]) {
  return cities.flatMap((city) => {
    const entry = cityBriefEntry(city)
    return entry ? [entry] : []
  })
}

const travelBriefCitySchema = z.object({
  name: z.string(),
  temperatureC: z.number(),
  conditions: z.string(),
  comfortScore: z.number().optional(),
  notes: z.string().optional(),
})

const scoreComfort = tool({
  description: "Score how comfortable the weather is for outdoor sightseeing (1-10).",
  inputSchema: z.object({
    city: z.string(),
    temperatureC: z.number(),
    conditions: z.string(),
    humidity: z.number().optional(),
    windKph: z.number().optional(),
  }),
  execute: async ({ city, temperatureC, conditions, humidity = 50, windKph = 10 }) =>
    comfortForWeather(city, temperatureC, conditions, humidity, windKph),
})

const formatTravelBrief = tool({
  description: "Turn structured research into a short travel weather brief for the user.",
  inputSchema: z.object({
    headline: z.string(),
    cities: z.array(travelBriefCitySchema).min(1),
    researchSummary: z.string().optional(),
  }),
  execute: async ({ headline, cities, researchSummary }) => {
    const lines = cities.map((entry) => {
      const comfort =
        entry.comfortScore !== undefined ? ` comfort ${entry.comfortScore}/10` : ""
      const notes = entry.notes ? ` — ${entry.notes}` : ""
      return `- ${entry.name}: ${entry.temperatureC}°C, ${entry.conditions}${comfort}${notes}`
    })
    return {
      headline,
      brief: [headline, "", ...lines, researchSummary ? `\nResearch notes: ${researchSummary}` : ""]
        .filter(Boolean)
        .join("\n"),
    }
  },
})

function createDelegateWeatherResearchTool(agent: MyAgent, parent: ParentContext) {
  const delegateOutputSchema = z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      summary: z.string(),
      cities: z.array(travelBriefCitySchema),
      research: z.unknown().optional(),
    }),
    z.object({
      ok: z.literal(false),
      status: z.string(),
      error: z.string(),
    }),
  ])

  return tool({
    description:
      "Run a dedicated weather research sub-agent that compares multiple cities with its own tool loop. Returns { ok, summary, cities } where cities is ready for formatTravelBrief.",
    inputSchema: z.object({
      cities: z.array(z.string()).min(1).describe("Cities to compare."),
      focus: z.string().optional().describe("What the research should optimize for."),
    }),
    outputSchema: delegateOutputSchema,
    execute: async (input, options) => {
      const toolCallId = options?.toolCallId ?? crypto.randomUUID()
      const span = trace.getActiveSpan()
      span?.setAttribute(AGENT_TOOL_ATTRIBUTES.parentToolCallId, toolCallId)

      const result = await agent.runAgentTool(WeatherResearchAgent, {
        input: {
          ...input,
          sessionId: parent.sessionId,
          userId: parent.userId,
        },
        parentToolCallId: toolCallId,
        signal: options?.abortSignal,
        display: { name: "Weather Researcher" },
      })

      span?.setAttribute(AGENT_TOOL_ATTRIBUTES.runId, result.runId)

      if (result.status !== "completed") {
        return {
          ok: false as const,
          status: result.status,
          error: result.error ?? "Weather research sub-agent did not complete",
        }
      }

      return {
        ok: true as const,
        summary: result.summary ?? "Weather research complete.",
        cities: cityBriefEntries(input.cities),
        research: result.output,
      }
    },
  })
}

export class WeatherResearchAgent extends AIChatAgent<Env> {
  private parentContext: ParentContext = {}

  protected override formatAgentToolInput(input: ResearchAgentInput, request: { runId: string }) {
    this.parentContext = { sessionId: input.sessionId, userId: input.userId, runId: request.runId }
    const cities = input.cities.join(", ")
    const focus = input.focus ?? "pick the best city for a weekend trip"
    return {
      id: `agent-tool-${request.runId}-input`,
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: `Compare weather for ${cities}. Focus: ${focus}. For each city call getWeatherDetail, then scoreComfort, then reply with a concise comparison.`,
        },
      ],
    }
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ) {
    const baseTracer = getLatitude(this.env).getTracer("cloudflare-codemode-research", {
      userId: this.parentContext.userId,
      sessionId: this.parentContext.sessionId,
      tags: ["cloudflare-codemode", "cloudflare-codemode-subagent"],
      metadata: { role: "weather-research-subagent" },
    })
    const tracer = withLatitudeAttributes(baseTracer, {
      [CODEMODE_ATTRIBUTES.turnId]: codemodeTurnId(this.parentContext.sessionId),
      ...(this.parentContext.runId ? { [AGENT_TOOL_ATTRIBUTES.runId]: this.parentContext.runId } : {}),
    })

    const tools = instrumentCodemodeTools(
      { getWeatherDetail, scoreComfort } as ToolSet,
      { tracer, toolCallIdPrefix: "research" },
    ) as ToolSet

    const result = streamText({
      model: workersModel(this.env),
      system:
        "You are a weather research specialist. Always use getWeatherDetail and scoreComfort for every city before answering.",
      messages: await convertToModelMessages(this.messages),
      tools,
      abortSignal: options?.abortSignal,
      experimental_telemetry: {
        isEnabled: true,
        tracer,
        functionId: "research-subagent-turn",
      },
      onFinish,
    })

    return result.toUIMessageStreamResponse()
  }

  protected override async onChatResponse() {
    await getLatitude(this.env).flush()
  }
}

export class MyAgent extends AIChatAgent<Env> {
  codemodeTool(tracer: ReturnType<Latitude["getTracer"]>, parent: ParentContext) {
    const sandboxTools = instrumentCodemodeTools(
      {
        lookupCity,
        getWeather,
        formatTravelBrief,
        delegateWeatherResearch: createDelegateWeatherResearchTool(this, parent),
      } as ToolSet,
      { tracer },
    )

    return createCodeTool({
      tools: sandboxTools as ToolSet,
      executor: new DynamicWorkerExecutor({ loader: this.env.LOADER }),
    })
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ) {
    const parent: ParentContext = {
      userId: stringFromBody(options?.body, "userId"),
      sessionId: stringFromBody(options?.body, "sessionId"),
    }

    const baseTracer = getLatitude(this.env).getTracer("cloudflare-codemode", {
      ...parent,
      tags: ["cloudflare-codemode", "codemode-orchestration"],
      metadata: {
        framework: "cloudflare-codemode",
        continuation: options?.continuation ?? false,
        scenario: "codemode-orchestration",
      },
    })
    const tracer = withLatitudeAttributes(baseTracer, {
      [CODEMODE_ATTRIBUTES.turnId]: codemodeTurnId(parent.sessionId),
    })

    const model = workersModel(this.env)
    const modelMessages = await convertToModelMessages(this.messages)
    const userText = latestUserText(this.messages, modelMessages)
    const telemetry = {
      isEnabled: true as const,
      tracer,
      functionId: "codemode-turn",
    }

    if (!shouldRunCodemodeOrchestration(userText)) {
      const result = streamText({
        model,
        system: "You are a friendly assistant. Reply briefly and naturally.",
        messages: modelMessages,
        abortSignal: options?.abortSignal,
        experimental_telemetry: telemetry,
        onFinish,
      })

      return result.toUIMessageStreamResponse()
    }

    try {
      const codemode = this.codemodeTool(tracer, parent)
      const afterCodemode = await runCodemodePlan({
        model,
        codemode,
        modelMessages,
        abortSignal: options?.abortSignal,
        experimental_telemetry: {
          ...telemetry,
          tracer: withLatitudeAttributes(tracer, { [CODEMODE_ATTRIBUTES.phase]: "plan" }),
          functionId: "codemode-plan",
        },
      })

      const result = streamText({
        model,
        system:
          "Summarize the codemode tool result for the user in plain language. Include a clear recommendation when comparing cities. Never show code.",
        messages: afterCodemode,
        abortSignal: options?.abortSignal,
        experimental_telemetry: {
          ...telemetry,
          tracer: withLatitudeAttributes(tracer, { [CODEMODE_ATTRIBUTES.phase]: "summarize" }),
          functionId: "codemode-summary",
        },
        onFinish,
      })

      return result.toUIMessageStreamResponse()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const result = streamText({
        model,
        system: "You are a friendly assistant.",
        messages: [
          ...modelMessages,
          {
            role: "user",
            content: `The codemode orchestration failed (${message}). Apologize briefly and suggest trying the travel weather comparison again.`,
          },
        ],
        abortSignal: options?.abortSignal,
        experimental_telemetry: telemetry,
        onFinish,
      })

      return result.toUIMessageStreamResponse()
    }
  }

  protected override async onChatResponse() {
    await getLatitude(this.env).flush()
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
