import { randomUUID } from "node:crypto"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { stepCountIs, streamText, tool } from "ai"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { Latitude } from "./init.ts"

describe("cloudflare-codemode telemetry", () => {
  afterEach(async () => {
    await latitude?.shutdown()
    latitude = undefined
  })

  let latitude: Latitude | undefined
  let exporter: InMemorySpanExporter

  function setupLatitude() {
    exporter = new InMemorySpanExporter()
    const hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })

    latitude = new Latitude({
      apiKey: "test-key",
      project: "test-project",
      tracerProvider: hostProvider,
      disableBatch: true,
    })

    return latitude
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
                    code: 'async () => { return await codemode.getWeather({ city: "Barcelona" }); }',
                  }),
                },
                {
                  type: "finish",
                  finishReason: "tool-calls",
                  usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
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
                { type: "text-delta", id: "text-1", delta: "Barcelona is sunny." },
                { type: "text-end", id: "text-1" },
                {
                  type: "finish",
                  finishReason: "stop",
                  usage: { inputTokens: 20, outputTokens: 7, totalTokens: 27 },
                },
              ]

        return { stream: simulateReadableStream({ chunks }) }
      },
    })
  }

  it("records model turns and the outer codemode tool call via AI SDK telemetry", async () => {
    const sdk = setupLatitude()

    const getWeather = tool({
      description: "Get the current weather for a city.",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, conditions: "sunny" }),
    })

    const codemode = tool({
      description: "Execute generated code.",
      inputSchema: z.object({ code: z.string() }),
      execute: async ({ code }) => {
        const runner = new Function("codemode", `return (${code})()`)
        return runner({ getWeather: getWeather.execute })
      },
    })

    const result = streamText({
      model: makeCodemodeModel(),
      messages: [{ role: "user", content: "Weather in Barcelona" }],
      tools: { codemode },
      stopWhen: stepCountIs(2),
      experimental_telemetry: {
        isEnabled: true,
        tracer: sdk.getTracer("cloudflare-codemode", {
          userId: "codemode-user",
          sessionId: "codemode-session",
          tags: ["cloudflare-codemode"],
        }),
        functionId: "codemode-turn",
      },
    })

    for await (const _delta of result.textStream) {
      // drain
    }

    await sdk.flush()

    const spans = exporter.getFinishedSpans()
    const toolNames = spans
      .map((span) => span.attributes["gen_ai.tool.name"])
      .filter((name): name is string => typeof name === "string")
    const spanNames = spans.map((span) => span.name)

    expect(spans.length).toBeGreaterThan(0)
    expect(
      spanNames.some((name) => name.includes("tool") || name.includes("codemode")) || toolNames.includes("codemode"),
    ).toBe(true)
    expect(toolNames).not.toContain("getWeather")
    expect(spans.some((span) => span.attributes["user.id"] === "codemode-user")).toBe(true)
    expect(spans.some((span) => span.attributes["session.id"] === "codemode-session")).toBe(true)
  })
})
