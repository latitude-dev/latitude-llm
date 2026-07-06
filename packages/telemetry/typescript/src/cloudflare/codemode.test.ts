import { context, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { tool } from "ai"
import { beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"
import { Latitude } from "../sdk/init.ts"
import { instrumentCodemodeTools } from "./codemode.ts"

describe("instrumentCodemodeTools", () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
  })

  it("emits ai.toolCall spans for wrapped tool execute functions", async () => {
    const exporter = new InMemorySpanExporter()
    const hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })

    const latitude = new Latitude({
      apiKey: "test-key",
      project: "test-project",
      tracerProvider: hostProvider,
      exporter,
      disableBatch: true,
    })

    const tracer = latitude.getTracer("cloudflare-codemode", {
      userId: "codemode-user",
      sessionId: "codemode-session",
      tags: ["cloudflare-codemode"],
    })

    const tools = instrumentCodemodeTools(
      {
        getWeather: tool({
          description: "Get weather",
          inputSchema: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ city, conditions: "sunny" }),
        }),
      },
      { tracer },
    )

    await tools.getWeather.execute!(
      { city: "Barcelona" },
      {
        toolCallId: "ignored",
        messages: [],
      },
    )

    await hostProvider.forceFlush()

    const spans = exporter.getFinishedSpans().filter((span) => span.name === "ai.toolCall getWeather")
    expect(spans.length).toBeGreaterThan(0)
    expect(spans[0]?.name).toBe("ai.toolCall getWeather")
    expect(spans[0]?.attributes["ai.operationId"]).toBe("ai.toolCall")
    expect(spans[0]?.attributes["ai.toolCall.name"]).toBe("getWeather")
    expect(spans[0]?.attributes["gen_ai.tool.name"]).toBe("getWeather")
    expect(spans[0]?.attributes["latitude.codemode.inner_tool"]).toBe(true)
    expect(spans[0]?.attributes["user.id"]).toBe("codemode-user")
    expect(spans[0]?.attributes["session.id"]).toBe("codemode-session")

    await latitude.shutdown()
  })

  it("synthesizes tool call options when execute is invoked without a second argument", async () => {
    const exporter = new InMemorySpanExporter()
    const hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })

    const latitude = new Latitude({
      apiKey: "test-key",
      project: "test-project",
      tracerProvider: hostProvider,
      exporter,
      disableBatch: true,
    })

    const tracer = latitude.getTracer("cloudflare-codemode")
    let receivedToolCallId: string | undefined

    const tools = instrumentCodemodeTools(
      {
        recordId: tool({
          description: "Record tool call id",
          inputSchema: z.object({ city: z.string() }),
          execute: async (_input, options) => {
            receivedToolCallId = options?.toolCallId
            return { ok: true }
          },
        }),
      },
      { tracer },
    )

    const executeWithoutOptions = tools.recordId.execute as (input: { city: string }) => Promise<{ ok: boolean }>
    await executeWithoutOptions({ city: "Barcelona" })

    expect(receivedToolCallId).toMatch(/^codemode-inner-recordId-/)

    await latitude.shutdown()
  })

  it("nests inner tool spans under the active parent span", async () => {
    const exporter = new InMemorySpanExporter()
    const hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })

    const latitude = new Latitude({
      apiKey: "test-key",
      project: "test-project",
      tracerProvider: hostProvider,
      exporter,
      disableBatch: true,
    })

    const tracer = latitude.getTracer("cloudflare-codemode", {
      sessionId: "codemode-session",
      tags: ["cloudflare-codemode"],
    })

    const tools = instrumentCodemodeTools(
      {
        getWeather: tool({
          description: "Get weather",
          inputSchema: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ city, conditions: "sunny" }),
        }),
      },
      { tracer },
    )

    const parentSpan = tracer.startSpan("ai.toolCall codemode")
    await context.with(trace.setSpan(context.active(), parentSpan), async () => {
      await tools.getWeather.execute!(
        { city: "Barcelona" },
        {
          toolCallId: "call_getWeather",
          messages: [],
        },
      )
    })
    parentSpan.end()

    await hostProvider.forceFlush()

    const spans = exporter.getFinishedSpans()
    const innerSpan = spans.find((span) => span.name === "ai.toolCall getWeather")

    expect(innerSpan).toBeDefined()
    expect(innerSpan?.attributes["latitude.codemode.inner_tool"]).toBe(true)
    expect(innerSpan?.parentSpanContext?.spanId).toBe(parentSpan.spanContext().spanId)
    expect(innerSpan?.spanContext().traceId).toBe(parentSpan.spanContext().traceId)

    await latitude.shutdown()
  })
})
