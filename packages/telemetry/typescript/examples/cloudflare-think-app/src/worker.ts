import { Think, type TurnConfig, type TurnResult } from "@cloudflare/think"
import { Latitude, capture, type ContextOptions } from "@latitude-data/telemetry"
import { getAgentByName, routeAgentRequest } from "agents"
import { tool } from "ai"
import { createWorkersAI } from "workers-ai-provider"
import { z } from "zod"
import { CHAT_PAGE } from "./chat-page"

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

function turnText(result: TurnResult): string {
  const parts = (result.message?.parts ?? []) as Array<{ type?: string; text?: string }>
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
}

function captureOptions(meta: { userId?: string; sessionId?: string }): ContextOptions {
  const options: ContextOptions = {
    tags: ["cloudflare-think"],
    metadata: { framework: "cloudflare-think", continuation: false },
  }

  if (meta.userId) options.userId = meta.userId
  if (meta.sessionId) options.sessionId = meta.sessionId

  return options
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

  beforeTurn(): TurnConfig {
    return {
      experimental_telemetry: {
        isEnabled: true,
        tracer: getLatitude(this.env).getAiSdkTracer(),
        functionId: "think-turn",
        metadata: { framework: "cloudflare-think" },
      },
    }
  }

  async runChatTurn(input: string, meta: { userId?: string; sessionId?: string }): Promise<{ text: string }> {
    try {
      const result = await capture("cloudflare-think-turn", () => this.runTurn({ input }), captureOptions(meta))
      return { text: turnText(result) }
    } finally {
      await getLatitude(this.env).flush()
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(CHAT_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } })
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const { message, sessionId, userId } = (await request.json()) as {
        message?: string
        sessionId?: string
        userId?: string
      }
      if (!message || !sessionId) {
        return Response.json({ error: "message and sessionId are required" }, { status: 400 })
      }

      const agent = await getAgentByName(env.MyAgent, sessionId)
      try {
        const meta: { userId?: string; sessionId?: string } = { sessionId }
        if (userId) meta.userId = userId
        const result = await agent.runChatTurn(message, meta)
        return Response.json(result)
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
      }
    }

    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
