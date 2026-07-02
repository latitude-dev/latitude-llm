import { AIChatAgent } from "@cloudflare/ai-chat"
import { DynamicWorkerExecutor } from "@cloudflare/codemode"
import { createCodeTool } from "@cloudflare/codemode/ai"
import { Latitude } from "@latitude-data/telemetry"
import { instrumentCodemodeTools } from "@latitude-data/telemetry/cloudflare"
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
  latitude ??= new Latitude({
    apiKey: env.LATITUDE_API_KEY,
    project: env.LATITUDE_PROJECT_SLUG,
    serviceName: "cloudflare-codemode-agent",
    ...(env.LATITUDE_TELEMETRY_URL ? { telemetryUrl: env.LATITUDE_TELEMETRY_URL } : {}),
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
  codemodeTool(tracer: ReturnType<Latitude["getTracer"]>) {
    const sandboxTools = instrumentCodemodeTools({ getWeather }, { tracer })

    return createCodeTool({
      tools: sandboxTools,
      executor: new DynamicWorkerExecutor({ loader: this.env.LOADER }),
    })
  }

  async onChatMessage(onFinish, options) {
    const tracer = getLatitude(this.env).getTracer("cloudflare-codemode", {
      userId: stringFromBody(options?.body, "userId"),
      sessionId: stringFromBody(options?.body, "sessionId"),
      tags: ["cloudflare-codemode"],
      metadata: {
        framework: "cloudflare-codemode",
        continuation: options?.continuation ?? false,
      },
    })

    const result = streamText({
      model: createWorkersAI({ binding: this.env.AI })("@cf/meta/llama-4-scout-17b-16e-instruct"),
      messages: await convertToModelMessages(this.messages),
      tools: { codemode: this.codemodeTool(tracer) },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
      experimental_telemetry: {
        isEnabled: true,
        tracer,
        functionId: "codemode-turn",
      },
      onFinish,
    })

    return result.toUIMessageStreamResponse()
  }

  override protected async onChatResponse() {
    await getLatitude(this.env).flush()
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
