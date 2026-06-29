import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { stepCountIs, streamText, tool } from "ai"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"
import { z } from "zod"
import { Latitude, capture } from "../../../dist/index.js"

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
    modelId: "@cf/meta/llama-3.1-8b-instruct",
    doStream: async () => {
      calls += 1

      const chunks =
        calls === 1
          ? [
              { type: "stream-start", warnings: [] },
              {
                type: "response-metadata",
                id: `resp_${randomUUID()}`,
                modelId: "@cf/meta/llama-3.1-8b-instruct",
                timestamp: new Date(),
              },
              {
                type: "tool-call",
                toolCallId: "call_get_weather",
                toolName: "getWeather",
                input: JSON.stringify({ city: "Barcelona" }),
              },
              { type: "finish", finishReason: "tool-calls", usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 } },
            ]
          : [
              { type: "stream-start", warnings: [] },
              {
                type: "response-metadata",
                id: `resp_${randomUUID()}`,
                modelId: "@cf/meta/llama-3.1-8b-instruct",
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

async function runThinkTurn() {
  const sessionId = `cloudflare-think-local-${randomUUID()}`
  const scope = capture.start("cloudflare-think-turn", {
    userId: "local-think-user",
    sessionId,
    tags: ["cloudflare-think", "local-e2e"],
    metadata: {
      verifier: "cloudflare-think-app",
      continuation: false,
      messageCount: 1,
    },
  })

  try {
    const result = streamText({
      model: makeThinkModel(),
      messages: [{ role: "user", content: "What is the weather in Barcelona? Use the weather tool." }],
      tools: { getWeather },
      stopWhen: stepCountIs(2),
      experimental_telemetry: latitude.getAiSdkTelemetry({
        functionId: "think-turn",
        metadata: { framework: "cloudflare-think", verifier: "local-e2e" },
      }),
    })

    let text = ""
    for await (const delta of result.textStream) text += delta

    scope.end()
    await latitude.flush()

    return { sessionId, text }
  } catch (error) {
    scope.end(error)
    await latitude.flush()
    throw error
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
    SELECT count(), countIf(name ILIKE '%tool%')
    FROM spans
    WHERE session_id = '${escaped}'
      AND has(tags, 'cloudflare-think')
      AND has(tags, 'local-e2e')
    FORMAT TabSeparated
  `

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const [spanCountRaw, toolSpanCountRaw] = (await queryClickHouse(sql)).split("\t")
    const spanCount = Number(spanCountRaw)
    const toolSpanCount = Number(toolSpanCountRaw)
    if (spanCount > 0 && toolSpanCount > 0) return { spanCount, toolSpanCount }
    await sleep(500)
  }

  throw new Error(`No tool spans found in ClickHouse for session ${sessionId}`)
}

const { sessionId, text } = await runThinkTurn()
const { spanCount, toolSpanCount } = await waitForSpans(sessionId)

console.log(JSON.stringify({ ok: true, sessionId, text, spanCount, toolSpanCount }, null, 2))
