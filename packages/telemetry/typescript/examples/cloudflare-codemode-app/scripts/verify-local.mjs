import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { createCodeTool, resolveProvider } from "@cloudflare/codemode/ai"
import { stepCountIs, streamText, tool } from "ai"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"
import { z } from "zod"
import { Latitude } from "../../../dist/index.js"

const ingestUrl = process.env.LATITUDE_TELEMETRY_URL ?? "http://localhost:3002"
const apiKey = process.env.LATITUDE_API_KEY ?? "lat_seed_default_api_key_token"
const project = process.env.LATITUDE_PROJECT_SLUG ?? "default-project"
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123"
const clickhouseUser = process.env.CLICKHOUSE_USER ?? "latitude"
const clickhousePassword = process.env.CLICKHOUSE_PASSWORD ?? "secret"
const clickhouseDatabase = process.env.CLICKHOUSE_DB ?? "latitude_development"

process.env.LATITUDE_TELEMETRY_URL = ingestUrl

const latitude = new Latitude({
  apiKey,
  project,
  serviceName: "cloudflare-codemode-agent-local",
  disableBatch: true,
})

const localExecutor = {
  async execute(code, providersOrFns) {
    const providers = Array.isArray(providersOrFns)
      ? providersOrFns
      : [resolveProvider({ tools: providersOrFns })]

    const scope = Object.fromEntries(providers.map((provider) => [provider.name, provider.fns]))
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const runner = new AsyncFunction(...Object.keys(scope), `return (${code})()`)

    try {
      const result = await runner(...Object.values(scope))
      return { result }
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

function makeCodemodeModel() {
  let calls = 0

  return new MockLanguageModelV3({
    provider: "cloudflare-workers-ai",
    modelId: "@cf/meta/llama-4-scout-17b-16e-instruct",
    doStream: async () => {
      calls += 1

      const chunks =
        calls === 1
          ? [
              { type: "stream-start", warnings: [] },
              {
                type: "response-metadata",
                id: `resp_${randomUUID()}`,
                modelId: "@cf/meta/llama-4-scout-17b-16e-instruct",
                timestamp: new Date(),
              },
              {
                type: "tool-call",
                toolCallId: "call_codemode",
                toolName: "codemode",
                input: JSON.stringify({
                  code: 'async () => { const weather = await codemode.getWeather({ city: "Barcelona" }); return weather; }',
                }),
              },
              { type: "finish", finishReason: "tool-calls", usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 } },
            ]
          : [
              { type: "stream-start", warnings: [] },
              {
                type: "response-metadata",
                id: `resp_${randomUUID()}`,
                modelId: "@cf/meta/llama-4-scout-17b-16e-instruct",
                timestamp: new Date(),
              },
              { type: "text-start", id: "text-1" },
              { type: "text-delta", id: "text-1", delta: "Barcelona is sunny and 21C." },
              { type: "text-end", id: "text-1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 20, outputTokens: 7, totalTokens: 27 } },
            ]

      return {
        stream: simulateReadableStream({ chunks }),
      }
    },
  })
}

const getWeather = tool({
  description: "Get the current weather for a city.",
  inputSchema: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => ({
    city,
    temperatureC: 21,
    conditions: "sunny",
  }),
})

const codemode = createCodeTool({
  tools: { getWeather },
  executor: localExecutor,
})

async function runCodemodeTurn() {
  const sessionId = `cloudflare-codemode-local-${randomUUID()}`

  try {
    const result = streamText({
      model: makeCodemodeModel(),
      messages: [{ role: "user", content: "What is the weather in Barcelona? Use codemode." }],
      tools: { codemode },
      stopWhen: stepCountIs(2),
      experimental_telemetry: {
        isEnabled: true,
        tracer: latitude.getTracer("cloudflare-codemode", {
          userId: "local-codemode-user",
          sessionId,
          tags: ["cloudflare-codemode", "local-e2e"],
          metadata: {
            verifier: "cloudflare-codemode-app",
            continuation: false,
          },
        }),
        functionId: "codemode-turn",
        metadata: { framework: "cloudflare-codemode", verifier: "local-e2e" },
      },
    })

    let text = ""
    for await (const delta of result.textStream) text += delta

    return { sessionId, text }
  } finally {
    await latitude.flush()
  }
}

async function queryClickHouse(sql) {
  const url = new URL(clickhouseUrl)
  url.searchParams.set("database", clickhouseDatabase)
  url.searchParams.set("query", sql)

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${clickhouseUser}:${clickhousePassword}`).toString("base64")}`,
    },
  })

  const body = await response.text()
  if (!response.ok) {
    throw new Error(`ClickHouse query failed (${response.status}): ${body}`)
  }

  return body.trim()
}

async function waitForSpans(sessionId) {
  const escaped = sessionId.replaceAll("'", "''")
  const sql = `
    SELECT
      count(),
      countIf(name ILIKE '%tool%'),
      countIf(name = 'ai.toolCall'),
      countIf(attributes['gen_ai.tool.name'] = 'codemode'),
      countIf(attributes['gen_ai.tool.name'] = 'getWeather'),
      countIf(user_id = 'local-codemode-user'),
      countIf(provider != '')
    FROM spans
    WHERE session_id = '${escaped}'
      AND has(tags, 'cloudflare-codemode')
      AND has(tags, 'local-e2e')
    FORMAT TabSeparated
  `

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const [
      spanCountRaw,
      toolSpanCountRaw,
      aiToolCallCountRaw,
      codemodeToolCountRaw,
      innerToolCountRaw,
      identifiedSpanCountRaw,
      providerSpanCountRaw,
    ] = (await queryClickHouse(sql)).split("\t")
    const spanCount = Number(spanCountRaw)
    const toolSpanCount = Number(toolSpanCountRaw)
    const aiToolCallCount = Number(aiToolCallCountRaw)
    const codemodeToolCount = Number(codemodeToolCountRaw)
    const innerToolCount = Number(innerToolCountRaw)
    const identifiedSpanCount = Number(identifiedSpanCountRaw)
    const providerSpanCount = Number(providerSpanCountRaw)

    if (
      spanCount > 0 &&
      toolSpanCount > 0 &&
      aiToolCallCount > 0 &&
      codemodeToolCount > 0 &&
      identifiedSpanCount === spanCount &&
      providerSpanCount > 0
    ) {
      return {
        spanCount,
        toolSpanCount,
        aiToolCallCount,
        codemodeToolCount,
        innerToolCount,
        identifiedSpanCount,
        providerSpanCount,
      }
    }
    await sleep(500)
  }

  throw new Error(`Expected codemode model and tool spans in ClickHouse for session ${sessionId}`)
}

const { sessionId, text } = await runCodemodeTurn()
const metrics = await waitForSpans(sessionId)

console.log(
  JSON.stringify(
    {
      ok: true,
      sessionId,
      text,
      ...metrics,
      innerToolsVisibleToAiSdkTelemetry: metrics.innerToolCount > 0,
    },
    null,
    2,
  ),
)
