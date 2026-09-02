import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { context as otelContext, ROOT_CONTEXT } from "@opentelemetry/api"
import { generateText, stepCountIs, streamText, tool } from "ai"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"
import { z } from "zod"
import { injectTraceContext, withTraceContext } from "../../../dist/cloudflare.js"
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
          : calls === 2
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
                  toolCallId: "call_draft_itinerary",
                  toolName: "draftItinerary",
                  input: JSON.stringify({ goal: "a sunny weekend in Barcelona" }),
                },
                {
                  type: "finish",
                  finishReason: "tool-calls",
                  usage: { inputTokens: 22, outputTokens: 9, totalTokens: 31 },
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
                  delta:
                    "Barcelona is sunny and about 190 EUR for two days. The planner suggests: Day 1 old town walk, Day 2 market and sunset viewpoint.",
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

function makePlannerModel() {
  return new MockLanguageModelV3({
    provider: "cloudflare-workers-ai",
    modelId: "@cf/meta/llama-4-scout-17b-16e-instruct",
    doGenerate: async () => ({
      finishReason: "stop",
      usage: { inputTokens: 24, outputTokens: 40, totalTokens: 64 },
      content: [{ type: "text", text: "Day 1: old town walk. Day 2: market and sunset viewpoint." }],
      warnings: [],
    }),
  })
}

// The planner runs in a second Durable Object, so the only thing tying it to the caller is the
// carrier. `ROOT_CONTEXT` stands in for that isolate: it strips the ambient context this process
// happens to have, so nothing but the carrier can reattach the turn.
async function runPlannerTurn(carrier) {
  return otelContext.with(ROOT_CONTEXT, () =>
    withTraceContext(carrier, async (remote) => {
      const result = await generateText({
        model: makePlannerModel(),
        prompt: "Draft a two-day itinerary for a sunny weekend in Barcelona.",
        experimental_telemetry: {
          isEnabled: true,
          tracer: remote.getTracer(latitude, "cloudflare-planner"),
          functionId: "planner-turn",
        },
      })

      return result.text
    }),
  )
}

async function runThinkTurn() {
  const sessionId = `cloudflare-think-local-${randomUUID()}`
  const context = {
    userId: "local-think-user",
    sessionId,
    tags: ["cloudflare-think", "local-e2e"],
    metadata: {
      verifier: "cloudflare-think-app",
      continuation: false,
      messageCount: 1,
      codemode: true,
    },
  }
  let plannerCarrier

  const draftItinerary = tool({
    description: "Ask the planner agent, running in its own Durable Object, for a two-day itinerary.",
    inputSchema: z.object({ goal: z.string() }),
    execute: async ({ goal }) => {
      // Stands in for `planner.draftItinerary(goal, injectTraceContext(...))` over Durable Object
      // RPC: the carrier is the whole handover, and the caller awaits the answer.
      plannerCarrier = injectTraceContext(context)
      return { goal, itinerary: await runPlannerTurn(plannerCarrier) }
    },
  })

  try {
    const result = streamText({
      model: makeThinkModel(),
      messages: [{ role: "user", content: "Use codemode and tools to plan a sunny weekend in Barcelona." }],
      tools: { execute, draftItinerary },
      stopWhen: stepCountIs(3),
      experimental_telemetry: {
        isEnabled: true,
        tracer: latitude.getTracer("cloudflare-think", context),
        functionId: "think-turn",
        metadata: { framework: "cloudflare-think", verifier: "local-e2e" },
      },
    })

    let text = ""
    for await (const delta of result.textStream) text += delta

    return { sessionId, text, plannerCarrier }
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

async function waitForPlannerTrace(sessionId) {
  const escaped = sessionId.replaceAll("'", "''")
  const sql = `
    SELECT span_id, parent_span_id, trace_id, name, tool_name
    FROM spans
    WHERE session_id = '${escaped}'
    FORMAT TabSeparated
  `

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const rows = (await queryClickHouse(sql))
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [spanId, parentSpanId, traceId, name, toolName] = line.split("\t")
        return { spanId, parentSpanId, traceId, name, toolName }
      })

    const toolSpan = rows.find((row) => row.toolName === "draftItinerary")
    const plannerSpans = rows.filter((row) => row.name.startsWith("ai.generateText"))
    const plannerRoot = plannerSpans.find((row) => row.parentSpanId === toolSpan?.spanId)
    const traceIds = new Set(rows.map((row) => row.traceId))

    if (toolSpan && plannerRoot && traceIds.size === 1) {
      return { traceId: plannerRoot.traceId, plannerSpanCount: plannerSpans.length }
    }
    await sleep(500)
  }

  throw new Error(`Expected the planner turn to join the orchestrator trace for session ${sessionId}`)
}

const { sessionId, text, plannerCarrier } = await runThinkTurn()

if (!plannerCarrier?.traceparent) {
  throw new Error("Expected the orchestrator to hand a traceparent to the planner")
}

const { spanCount, toolSpanCount, codemodeSpanCount, identifiedSpanCount, providerSpanCount } =
  await waitForSpans(sessionId)
const { traceId, plannerSpanCount } = await waitForPlannerTrace(sessionId)

console.log(
  JSON.stringify(
    {
      ok: true,
      sessionId,
      traceId,
      text,
      spanCount,
      toolSpanCount,
      codemodeSpanCount,
      identifiedSpanCount,
      providerSpanCount,
      plannerSpanCount,
    },
    null,
    2,
  ),
)
