import { AIChatAgent } from "@cloudflare/ai-chat"
import { DynamicWorkerExecutor } from "@cloudflare/codemode"
import { createCodeTool } from "@cloudflare/codemode/ai"
import { Latitude } from "@latitude-data/telemetry"
import { routeAgentRequest } from "agents"
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai"
import { createWorkersAI } from "workers-ai-provider"
import { z } from "zod"

type Env = {
  AI: Ai
  LOADER: WorkerLoader
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
    serviceName: "cloudflare-codemode-agent",
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

export class MyAgent extends AIChatAgent<Env> {
  codemodeTool() {
    return createCodeTool({
      tools: { getWeather },
      executor: new DynamicWorkerExecutor({ loader: this.env.LOADER }),
    })
  }

  async onChatMessage(onFinish, options) {
    const result = streamText({
      model: createWorkersAI({ binding: this.env.AI })("@cf/meta/llama-4-scout-17b-16e-instruct"),
      messages: await convertToModelMessages(this.messages),
      tools: { codemode: this.codemodeTool() },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
      experimental_telemetry: {
        isEnabled: true,
        tracer: getLatitude(this.env).getTracer("cloudflare-codemode", {
          userId: stringFromBody(options?.body, "userId"),
          sessionId: stringFromBody(options?.body, "sessionId"),
          tags: ["cloudflare-codemode"],
          metadata: {
            framework: "cloudflare-codemode",
            continuation: options?.continuation ?? false,
          },
        }),
        functionId: "codemode-turn",
      },
      onFinish,
    })

    return result.toUIMessageStreamResponse()
  }

  protected async onChatResponse() {
    await getLatitude(this.env).flush()
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
