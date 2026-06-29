import {
  Think,
  type ChatErrorContext,
  type ChatResponseResult,
  type TurnConfig,
  type TurnContext,
} from "@cloudflare/think"
import { Latitude, capture, type CaptureScope } from "@latitude-data/telemetry"
import { routeAgentRequest } from "agents"
import { tool } from "ai"
import { createWorkersAI } from "workers-ai-provider"
import { z } from "zod"

type Env = {
  AI: Ai
  LATITUDE_API_KEY: string
  LATITUDE_PROJECT_SLUG: string
  LATITUDE_TELEMETRY_URL?: string
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

function stringFromBody(body: Record<string, unknown> | undefined, key: string) {
  const value = body?.[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

const getWeather = tool({
  description: "Get the current weather for a city.",
  inputSchema: z.object({
    city: z.string().describe("City to look up."),
  }),
  execute: async ({ city }) => ({
    city,
    temperatureC: 21,
    conditions: "sunny",
  }),
})

export class MyAgent extends Think<Env> {
  private latitudeCapture?: CaptureScope

  getModel() {
    return createWorkersAI({ binding: this.env.AI })("@cf/meta/llama-3.1-8b-instruct")
  }

  getTools() {
    return { getWeather }
  }

  beforeTurn(ctx: TurnContext): TurnConfig {
    const latitude = getLatitude(this.env)

    this.latitudeCapture?.end()
    this.latitudeCapture = capture.start("cloudflare-think-turn", {
      userId: stringFromBody(ctx.body, "userId"),
      sessionId: stringFromBody(ctx.body, "sessionId"),
      tags: ["cloudflare-think"],
      metadata: {
        continuation: ctx.continuation,
        messageCount: ctx.messages.length,
      },
    })

    return {
      experimental_telemetry: {
        isEnabled: true,
        tracer: latitude.getAiSdkTracer(),
        functionId: "think-turn",
        metadata: { framework: "cloudflare-think" },
      },
    }
  }

  onChatResponse(result: ChatResponseResult) {
    const error = result.status === "error" ? new Error(result.error ?? "Think turn failed") : undefined
    this.latitudeCapture?.end(error)
    this.latitudeCapture = undefined
  }

  onChatError(error: unknown, _ctx?: ChatErrorContext) {
    this.latitudeCapture?.end(error)
    this.latitudeCapture = undefined
    return error
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const latitude = getLatitude(env)
    const response =
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })

    ctx.waitUntil(latitude.flush())

    return response
  },
} satisfies ExportedHandler<Env>
