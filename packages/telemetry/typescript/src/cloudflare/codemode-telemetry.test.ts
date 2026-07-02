import { randomUUID } from "node:crypto"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { stepCountIs, streamText, tool } from "ai"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { Latitude } from "../sdk/init.ts"
import { instrumentCodemodeTools } from "./codemode.ts"

describe("cloudflare-codemode telemetry", () => {
  afterEach(async () => {
    await latitude?.shutdown()
    latitude = undefined
  })

  let latitude: Latitude | undefined
  let exporter: InMemorySpanExporter
  let hostProvider: NodeTracerProvider

  function setupLatitude() {
    exporter = new InMemorySpanExporter()
    hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })

    latitude = new Latitude({
      apiKey: "test-key",
      project: "test-project",
      tracerProvider: hostProvider,
      exporter,
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

        if (calls === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
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
              ],
            }),
          }
        }

        return {
          stream: simulateReadableStream({
            chunks: [
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
            ],
          }),
        }
      },
    } as ConstructorParameters<typeof MockLanguageModelV3>[0])
  }

  it("records model turns, the outer codemode tool call, and inner sandbox tools", async () => {
    const sdk = setupLatitude()
    const tracer = sdk.getTracer("cloudflare-codemode", {
      userId: "codemode-user",
      sessionId: "codemode-session",
      tags: ["cloudflare-codemode"],
    })

    const getWeather = tool({
      description: "Get the current weather for a city.",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, conditions: "sunny" }),
    })

    const sandboxTools = instrumentCodemodeTools({ getWeather }, { tracer })

    const codemode = tool({
      description: "Execute generated code.",
      inputSchema: z.object({ code: z.string() }),
      execute: async ({ code }) => {
        const runner = new Function("codemode", `return (${code})()`)
        const toolFns = Object.fromEntries(
          Object.entries(sandboxTools).map(([name, sandboxTool]) => [
            name,
            (input: { city: string }) =>
              sandboxTool.execute!(input, {
                toolCallId: `test-${name}`,
                messages: [],
              }),
          ]),
        )
        return runner(toolFns)
      },
    })

    const result = streamText({
      model: makeCodemodeModel(),
      messages: [{ role: "user", content: "Weather in Barcelona" }],
      tools: { codemode },
      stopWhen: stepCountIs(2),
      experimental_telemetry: {
        isEnabled: true,
        tracer,
        functionId: "codemode-turn",
      },
    })

    for await (const _delta of result.textStream) {
      // drain
    }

    await hostProvider.forceFlush()

    const spans = exporter.getFinishedSpans()
    const toolNames = [
      ...new Set(
        spans
          .map((span) => span.attributes["gen_ai.tool.name"])
          .filter((name): name is string => typeof name === "string"),
      ),
    ]

    expect(spans.length).toBeGreaterThan(0)
    expect(spans.some((span) => span.attributes["ai.toolCall.name"] === "codemode")).toBe(true)
    expect(spans.some((span) => span.attributes["ai.toolCall.name"] === "getWeather")).toBe(true)
    expect(toolNames).toContain("getWeather")
    expect(spans.some((span) => span.attributes["user.id"] === "codemode-user")).toBe(true)
    expect(spans.some((span) => span.attributes["session.id"] === "codemode-session")).toBe(true)
  })
})
