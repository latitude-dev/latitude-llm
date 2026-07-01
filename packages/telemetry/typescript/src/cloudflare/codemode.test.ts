import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { tool } from "ai"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { Latitude } from "../sdk/init.ts"
import { instrumentCodemodeTools } from "./codemode.ts"

describe("instrumentCodemodeTools", () => {
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
})
