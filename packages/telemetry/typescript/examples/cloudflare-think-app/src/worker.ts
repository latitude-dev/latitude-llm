import { Think, type TurnConfig, type TurnContext } from "@cloudflare/think"
import { Latitude } from "@latitude-data/telemetry"
import { routeAgentRequest } from "agents"
import { tool } from "ai"
import { createWorkersAI } from "workers-ai-provider"
import { z } from "zod"

type Env = {
  AI: Ai
  MyAgent: DurableObjectNamespace<MyAgent>
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
  getModel() {
    return createWorkersAI({ binding: this.env.AI })("@cf/meta/llama-4-scout-17b-16e-instruct")
  }

  getTools() {
    return { getWeather }
  }

  beforeTurn(ctx: TurnContext): TurnConfig {
    return {
      experimental_telemetry: {
        isEnabled: true,
        tracer: getLatitude(this.env).getAiSdkTracer({
          userId: stringFromBody(ctx.body, "userId"),
          sessionId: stringFromBody(ctx.body, "sessionId"),
          tags: ["cloudflare-think"],
          metadata: { framework: "cloudflare-think", continuation: ctx.continuation },
        }),
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
