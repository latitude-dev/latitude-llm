import { context, propagation, trace } from "@opentelemetry/api"
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-node"
import { afterEach, describe, expect, it } from "vitest"
import { createCodemodeTelemetry } from "./codemode.ts"
import { Latitude } from "./init.ts"

function attr(span: { attributes: Record<string, unknown> }, name: string) {
  return span.attributes[name]
}

describe("createCodemodeTelemetry", () => {
  afterEach(() => {
    trace.disable()
    context.disable()
    propagation.disable()
  })

  it("parents traced internal tool spans under the outer execute tool span", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = new Latitude({ apiKey: "test-key", project: "test-project", exporter, disableBatch: true })
    const telemetry = createCodemodeTelemetry({
      latitude,
      scope: "cloudflare-think-codemode",
      context: {
        project: "test-project",
        sessionId: "sess-1",
        userId: "user-1",
        tags: ["cloudflare-think"],
        metadata: { framework: "cloudflare-think" },
      },
    })

    const tools = telemetry.traceToolSet({
      getWeather: {
        execute: async (input: unknown) => ({ input, temperatureC: 21 }),
      },
    })
    const executeTool = telemetry.wrapExecuteTool({
      execute: async (_input: unknown) => tools.getWeather.execute({ city: "Barcelona" }),
    })

    const tracer = latitude.getTracer("cloudflare-think", { sessionId: "sess-1", userId: "user-1" })
    await tracer.startActiveSpan("ai.toolCall", async (span) => {
      span.setAttributes({ "ai.operationId": "ai.toolCall", "ai.toolCall.name": "execute" })
      await executeTool.execute({ code: "return tools.getWeather(...)" })
      span.end()
    })

    await latitude.flush()

    const spans = exporter.getFinishedSpans()
    const execute = spans.find((span) => span.name === "ai.toolCall")
    const weather = spans.find((span) => span.name === "ai.toolCall getWeather")

    expect(execute).toBeDefined()
    expect(weather).toBeDefined()
    expect(weather?.parentSpanContext?.spanId).toBe(execute?.spanContext().spanId)
    expect(weather?.spanContext().traceId).toBe(execute?.spanContext().traceId)
    expect(weather?.instrumentationScope.name).toBe("so.latitude.instrumentation.cloudflare-think-codemode")
    expect(weather ? attr(weather, "session.id") : undefined).toBe("sess-1")
    expect(weather ? attr(weather, "user.id") : undefined).toBe("user-1")
    expect(weather ? attr(weather, "latitude.project") : undefined).toBe("test-project")
    expect(weather ? attr(weather, "ai.operationId") : undefined).toBe("ai.toolCall")
    expect(weather ? attr(weather, "ai.toolCall.name") : undefined).toBe("getWeather")
    expect(weather ? attr(weather, "gen_ai.tool.name") : undefined).toBe("getWeather")
    expect(weather ? attr(weather, "ai.toolCall.args") : undefined).toBe(JSON.stringify({ city: "Barcelona" }))
    expect(weather ? attr(weather, "ai.toolCall.result") : undefined).toBe(
      JSON.stringify({ input: { city: "Barcelona" }, temperatureC: 21 }),
    )

    await latitude.shutdown()
  })

  it("does not misparent internal spans when execute calls overlap", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = new Latitude({ apiKey: "test-key", project: "test-project", exporter, disableBatch: true })
    let sessionId = ""
    const telemetry = createCodemodeTelemetry({
      latitude,
      context: () => ({ sessionId }),
    })
    const callbacks = new Map<string, () => Promise<void>>()
    const tools = telemetry.traceToolSet({
      internalTool: {
        execute: async ({ id }: { id: string }) => ({ id }),
      },
    })
    const executeTool = telemetry.wrapExecuteTool({
      execute: ({ id }: { id: string }) =>
        new Promise<{ id: string }>((resolve, reject) => {
          callbacks.set(id, () => tools.internalTool.execute({ id }).then(resolve, reject))
        }),
    })
    const tracer = latitude.getTracer("cloudflare-think")
    const run = (id: string) => {
      sessionId = id
      return tracer.startActiveSpan(`ai.toolCall execute ${id}`, async (span) => {
        const output = await executeTool.execute({ id })
        span.end()
        return output
      })
    }

    const first = run("first")
    const second = run("second")
    await Promise.resolve()

    const callFirst = callbacks.get("first")
    const callSecond = callbacks.get("second")
    expect(callFirst).toBeDefined()
    expect(callSecond).toBeDefined()
    await Promise.all([callFirst?.(), callSecond?.()])
    await Promise.all([first, second])

    const third = run("third")
    await Promise.resolve()

    const callThird = callbacks.get("third")
    expect(callThird).toBeDefined()
    await callThird?.()
    await third
    await latitude.flush()

    const spans = exporter.getFinishedSpans()
    const internalSpans = spans.filter((span) => span.name === "ai.toolCall internalTool")
    const thirdExecute = spans.find((span) => span.name === "ai.toolCall execute third")

    expect(internalSpans).toHaveLength(1)
    expect(internalSpans[0]?.parentSpanContext?.spanId).toBe(thirdExecute?.spanContext().spanId)
    expect(internalSpans[0] ? attr(internalSpans[0], "session.id") : undefined).toBe("third")

    await latitude.shutdown()
  })

  it("supports input and output redaction", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = new Latitude({ apiKey: "test-key", project: "test-project", exporter, disableBatch: true })
    const telemetry = createCodemodeTelemetry({
      latitude,
      context: { sessionId: "sess-1" },
      redact: (_value, info) => ({ redacted: info.phase }),
    })

    await telemetry.traceToolCall({
      name: "secretTool",
      input: { token: "secret" },
      execute: async () => ({ token: "secret-output" }),
    })

    await latitude.flush()

    const span = exporter.getFinishedSpans().find((finished) => finished.name === "ai.toolCall secretTool")
    expect(span ? attr(span, "ai.toolCall.args") : undefined).toBe(JSON.stringify({ redacted: "input" }))
    expect(span ? attr(span, "ai.toolCall.result") : undefined).toBe(JSON.stringify({ redacted: "output" }))

    await latitude.shutdown()
  })

  it("records exceptions on failed internal tools", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = new Latitude({ apiKey: "test-key", project: "test-project", exporter, disableBatch: true })
    const telemetry = createCodemodeTelemetry({ latitude })

    await expect(
      telemetry.traceToolCall({
        name: "brokenTool",
        input: { ok: false },
        execute: async () => {
          throw new Error("boom")
        },
      }),
    ).rejects.toThrow("boom")

    await latitude.flush()

    const span = exporter.getFinishedSpans().find((finished) => finished.name === "ai.toolCall brokenTool")
    expect(span?.status.message).toBe("boom")
    expect(span?.events.some((event) => event.name === "exception")).toBe(true)

    await latitude.shutdown()
  })
})
