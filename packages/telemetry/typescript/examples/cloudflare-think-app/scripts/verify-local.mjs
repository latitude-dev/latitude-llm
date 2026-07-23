import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
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
  serviceName: "cloudflare-think-agent-local",
  disableBatch: true,
})

function makeThinkModel() {
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
                toolCallId: "call_execute_codemode",
                toolName: "execute",
                input: JSON.stringify({
                  code: `async () => {
  const weather = await tools.getWeather({ city: "Barcelona" })
  const budget = await tools.estimateTripBudget({ city: "Barcelona", days: 2, travelers: 1 })
  const highlights = await tools.listCityHighlights({ city: "Barcelona" })
  return { weather, budget, highlights }
}`,
                }),
              },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: { inputTokens: 18, outputTokens: 8, totalTokens: 26 },
              },
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
              {
                type: "text-delta",
                id: "text-1",
                delta: "Barcelona is sunny, estimated at 190 EUR, with three local highlights.",
              },
              { type: "text-end", id: "text-1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 30, outputTokens: 12, totalTokens: 42 } },
            ]

      return {
        stream: simulateReadableStream({ chunks }),
      }
    },
  })
}

const codemodeTools = {
  getWeather: tool({
    description: "Get the current weather for a city.",
    inputSchema: z.object({
      city: z.string(),
    }),
    execute: async ({ city }) => ({
      city,
      temperatureC: 21,
      conditions: "sunny",
    }),
  }),
  estimateTripBudget: tool({
    description: "Estimate a simple trip budget for a city.",
    inputSchema: z.object({
      city: z.string(),
      days: z.number().int().positive(),
      travelers: z.number().int().positive(),
    }),
    execute: async ({ city, days, travelers }) => ({
      city,
      estimatedEur: days * travelers * 95,
    }),
  }),
  listCityHighlights: tool({
    description: "List deterministic city highlights.",
    inputSchema: z.object({
      city: z.string(),
    }),
    execute: async ({ city }) => ({
      city,
      highlights: ["old town walk", "local market", "sunset viewpoint"],
    }),
  }),
}

const execute = tool({
  description: "Mock the Cloudflare Think execute codemode tool for Node-local verification.",
  inputSchema: z.object({
    code: z.string(),
  }),
  execute: async ({ code }) => {
    const weather = await codemodeTools.getWeather.execute({ city: "Barcelona" })
    const budget = await codemodeTools.estimateTripBudget.execute({ city: "Barcelona", days: 2, travelers: 1 })
    const highlights = await codemodeTools.listCityHighlights.execute({ city: "Barcelona" })
    return {
      code,
      result: { weather, budget, highlights },
      logs: ["mocked codemode execution with tools"],
    }
  },
})

async function runThinkTurn() {
  const sessionId = `cloudflare-think-local-${randomUUID()}`

  try {
    const result = streamText({
      model: makeThinkModel(),
      messages: [{ role: "user", content: "Use codemode and tools to plan a sunny weekend in Barcelona." }],
      tools: { execute },
      stopWhen: stepCountIs(2),
      experimental_telemetry: {
        isEnabled: true,
        tracer: latitude.getTracer("cloudflare-think", {
          userId: "local-think-user",
          sessionId,
          tags: ["cloudflare-think", "local-e2e"],
          metadata: {
            verifier: "cloudflare-think-app",
            continuation: false,
            messageCount: 1,
            codemode: true,
          },
        }),
        functionId: "think-turn",
        metadata: { framework: "cloudflare-think", verifier: "local-e2e" },
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
      countIf(tool_name = 'execute'),
      countIf(user_id = 'local-think-user'),
      countIf(provider != '')
    FROM spans
    WHERE session_id = '${escaped}'
      AND has(tags, 'cloudflare-think')
      AND has(tags, 'local-e2e')
    FORMAT TabSeparated
  `

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const [spanCountRaw, toolSpanCountRaw, codemodeSpanCountRaw, identifiedSpanCountRaw, providerSpanCountRaw] = (
      await queryClickHouse(sql)
    ).split("\t")
    const spanCount = Number(spanCountRaw)
    const toolSpanCount = Number(toolSpanCountRaw)
    const codemodeSpanCount = Number(codemodeSpanCountRaw)
    const identifiedSpanCount = Number(identifiedSpanCountRaw)
    const providerSpanCount = Number(providerSpanCountRaw)
    if (
      spanCount > 0 &&
      toolSpanCount > 0 &&
      codemodeSpanCount > 0 &&
      identifiedSpanCount === spanCount &&
      providerSpanCount > 0
    ) {
      return { spanCount, toolSpanCount, codemodeSpanCount, identifiedSpanCount, providerSpanCount }
    }
    await sleep(500)
  }

  throw new Error(`Expected identified model and codemode tool spans in ClickHouse for session ${sessionId}`)
}

const { sessionId, text } = await runThinkTurn()
const { spanCount, toolSpanCount, codemodeSpanCount, identifiedSpanCount, providerSpanCount } =
  await waitForSpans(sessionId)

console.log(
  JSON.stringify(
    { ok: true, sessionId, text, spanCount, toolSpanCount, codemodeSpanCount, identifiedSpanCount, providerSpanCount },
    null,
    2,
  ),
)
