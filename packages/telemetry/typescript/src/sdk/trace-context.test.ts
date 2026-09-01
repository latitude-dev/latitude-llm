import { context, propagation, trace } from "@opentelemetry/api"
import { InMemorySpanExporter, type ReadableSpan } from "@opentelemetry/sdk-trace-node"
import { afterEach, describe, expect, it } from "vitest"
import { capture } from "./context.ts"
import { Latitude } from "./init.ts"
import { extractTraceContext, injectTraceContext, withTraceContext } from "./trace-context.ts"

function newLatitude(exporter: InMemorySpanExporter) {
  return new Latitude({ apiKey: "test-key", project: "test-project", exporter, disableBatch: true })
}

function find(spans: readonly ReadableSpan[], name: string) {
  return spans.find((span) => span.name === name)
}

describe("injectTraceContext", () => {
  afterEach(() => {
    trace.disable()
    context.disable()
    propagation.disable()
  })

  it("carries the active span and the ambient Latitude context", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = newLatitude(exporter)
    let carrier: Record<string, string> = {}

    await capture(
      "orchestrator-turn",
      async () => {
        await latitude.getTracer("orchestrator").startActiveSpan("ai.toolCall plan", async (span) => {
          carrier = injectTraceContext()
          span.end()
        })
      },
      { sessionId: "sess-1", userId: "user-1", project: "acme", tags: ["orchestrator"], metadata: { plan: "pro" } },
    )
    await latitude.flush()

    const toolSpan = find(exporter.getFinishedSpans(), "ai.toolCall plan")
    expect(carrier.traceparent).toBe(`00-${toolSpan?.spanContext().traceId}-${toolSpan?.spanContext().spanId}-01`)
    expect(JSON.parse(carrier["x-latitude-context"] ?? "{}")).toEqual({
      sessionId: "sess-1",
      userId: "user-1",
      project: "acme",
      tags: ["orchestrator"],
      metadata: { plan: "pro" },
    })

    await latitude.shutdown()
  })

  it("leaves out the SDK's default project, which each side applies from its own configuration", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = newLatitude(exporter)

    const carrier = await capture("orchestrator-turn", async () => injectTraceContext(), { sessionId: "sess-1" })

    expect(JSON.parse(carrier["x-latitude-context"] ?? "{}")).not.toHaveProperty("project")

    await latitude.shutdown()
  })

  it("leaves out the capture name so the callee's spans are not relabelled", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = newLatitude(exporter)
    let carrier: Record<string, string> = {}

    await capture("orchestrator-turn", async () => {
      carrier = injectTraceContext()
    })

    expect(JSON.parse(carrier["x-latitude-context"] ?? "{}")).not.toHaveProperty("name")

    await latitude.shutdown()
  })

  it("escapes non-Latin-1 metadata so the carrier survives fetch headers", () => {
    const carrier = injectTraceContext({ metadata: { city: "Málaga 🌤" } })
    const encoded = carrier["x-latitude-context"] ?? ""

    expect([...encoded].every((char) => char.charCodeAt(0) <= 0xff)).toBe(true)
    expect(JSON.parse(encoded)).toEqual({ metadata: { city: "Málaga 🌤" } })
  })

  it("carries context only when no span is active, leaving the callee a root", () => {
    const carrier = injectTraceContext({ sessionId: "sess-1" })

    expect(carrier).not.toHaveProperty("traceparent")
    expect(extractTraceContext(carrier).parent).toBeUndefined()
  })

  it("writes into a caller-supplied carrier so it can be spread into headers", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = newLatitude(exporter)

    const headers = await latitude.getTracer("orchestrator").startActiveSpan("ai.toolCall plan", async (span) => {
      const out = injectTraceContext({ sessionId: "sess-1" }, { "content-type": "application/json" })
      span.end()
      return out
    })

    expect(headers["content-type"]).toBe("application/json")
    expect(headers.traceparent).toBeDefined()

    await latitude.shutdown()
  })
})

describe("extractTraceContext", () => {
  afterEach(() => {
    trace.disable()
    context.disable()
    propagation.disable()
  })

  it("parents the callee's spans on the caller's tool span across two SDK instances", async () => {
    const callerExporter = new InMemorySpanExporter()
    const caller = newLatitude(callerExporter)

    const carrier = await caller.getTracer("orchestrator").startActiveSpan("ai.toolCall plan", async (span) => {
      const out = injectTraceContext({ sessionId: "sess-1", userId: "user-1", project: "acme" })
      span.end()
      return out
    })
    await caller.flush()
    const toolSpan = find(callerExporter.getFinishedSpans(), "ai.toolCall plan")

    // A second Durable Object: its own SDK instance, its own exporter, no shared memory.
    const calleeExporter = new InMemorySpanExporter()
    const callee = new Latitude({
      apiKey: "test-key",
      project: "test-project",
      exporter: calleeExporter,
      disableBatch: true,
      tracerProvider: caller.provider,
    })

    await withTraceContext(carrier, async (remote) => {
      await remote.getTracer(callee, "planner").startActiveSpan("ai.generateText", async (span) => {
        span.end()
      })
    })
    await callee.flush()

    const plannerSpan = find(calleeExporter.getFinishedSpans(), "ai.generateText")
    expect(plannerSpan?.spanContext().traceId).toBe(toolSpan?.spanContext().traceId)
    expect(plannerSpan?.parentSpanContext?.spanId).toBe(toolSpan?.spanContext().spanId)
    expect(plannerSpan?.attributes["session.id"]).toBe("sess-1")
    expect(plannerSpan?.attributes["user.id"]).toBe("user-1")
    expect(plannerSpan?.attributes["latitude.project"]).toBe("acme")

    await callee.shutdown()
  })

  it("parents a framework-owned tracer with no ambient context", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = newLatitude(exporter)
    const carrier = {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01",
      "x-latitude-context": JSON.stringify({ sessionId: "sess-1" }),
    }

    // Cloudflare Think hands the tracer back from `beforeTurn()` and starts the turn later, outside
    // any context this side could have entered.
    const tracer = extractTraceContext(carrier).getTracer(latitude, "planner")
    await tracer.startActiveSpan("ai.generateText", async (span) => {
      await tracer.startActiveSpan("ai.toolCall lookup", async (child) => child.end())
      span.end()
    })
    await latitude.flush()

    const spans = exporter.getFinishedSpans()
    const turn = find(spans, "ai.generateText")
    const tool = find(spans, "ai.toolCall lookup")

    expect(turn?.spanContext().traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736")
    expect(turn?.parentSpanContext?.spanId).toBe("2222222222222222")
    expect(turn?.attributes["session.id"]).toBe("sess-1")
    // A nested span keeps its real parent: the remote parent only stands in for a missing one.
    expect(tool?.parentSpanContext?.spanId).toBe(turn?.spanContext().spanId)

    await latitude.shutdown()
  })

  it("reads a Request and a Headers as carriers", () => {
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01"
    const headers = new Headers({ traceparent })

    expect(extractTraceContext(headers).parent?.spanId).toBe("2222222222222222")
    expect(extractTraceContext(new Request("https://example.com", { headers })).parent?.spanId).toBe("2222222222222222")
  })

  it("reads carrier keys case-insensitively", () => {
    const carrier = { TraceParent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01" }

    expect(extractTraceContext(carrier).parent?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736")
  })

  it("keeps the sampled flag out of a non-sampled handover", () => {
    const carrier = { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-00" }

    expect(extractTraceContext(carrier).parent?.sampled).toBe(false)
  })

  it("ignores trailing fields of a future traceparent version", () => {
    const carrier = { traceparent: "01-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01-extra" }

    expect(extractTraceContext(carrier).parent?.spanId).toBe("2222222222222222")
  })

  it.each([
    ["absent", undefined],
    ["empty", {}],
    ["truncated", { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222" }],
    ["version ff", { traceparent: "ff-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01" }],
    ["all-zero trace id", { traceparent: `00-${"0".repeat(32)}-2222222222222222-01` }],
    ["all-zero span id", { traceparent: `00-4bf92f3577b34da6a3ce929d0e0e4736-${"0".repeat(16)}-01` }],
    ["over-long version 00", { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01-extra" }],
    ["non-hex", { traceparent: "00-zzf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01" }],
    ["newline-split", { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222\n222222222222-01" }],
  ])("makes the callee a root when the traceparent is %s", (_case, carrier) => {
    expect(extractTraceContext(carrier).parent).toBeUndefined()
  })

  it("stays inside an enclosing capture when no carrier arrived", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = newLatitude(exporter)

    // Resetting to a clean context on an absent carrier would tear this work out of its own capture.
    await capture(
      "planner-turn",
      async () => {
        await withTraceContext(undefined, async () => {
          latitude.getTracer("planner").startSpan("work").end()
        })
      },
      { sessionId: "local-session" },
    )
    await latitude.flush()

    const spans = exporter.getFinishedSpans()
    const root = find(spans, "planner-turn")
    const work = find(spans, "work")

    expect(work?.spanContext().traceId).toBe(root?.spanContext().traceId)
    expect(work?.parentSpanContext?.spanId).toBe(root?.spanContext().spanId)
    expect(work?.attributes["session.id"]).toBe("local-session")

    await latitude.shutdown()
  })

  it("overrides the receiver's context with what the carrier holds and keeps the rest", async () => {
    const exporter = new InMemorySpanExporter()
    const latitude = newLatitude(exporter)
    const carrier = {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01",
      "x-latitude-context": JSON.stringify({ sessionId: "caller-session" }),
    }

    await capture(
      "planner-turn",
      async () => {
        await withTraceContext(carrier, async () => {
          latitude.getTracer("planner").startSpan("work").end()
        })
      },
      { sessionId: "local-session", userId: "local-user" },
    )
    await latitude.flush()

    const work = find(exporter.getFinishedSpans(), "work")
    expect(work?.parentSpanContext?.spanId).toBe("2222222222222222")
    expect(work?.attributes["session.id"]).toBe("caller-session")
    expect(work?.attributes["user.id"]).toBe("local-user")

    await latitude.shutdown()
  })

  it("leaves baggage the host SDK set in place", async () => {
    const latitude = newLatitude(new InMemorySpanExporter())
    const tenant = propagation.setBaggage(context.active(), propagation.createBaggage({ tenant: { value: "acme" } }))

    const seen = context.with(tenant, () =>
      withTraceContext(
        { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01" },
        () => propagation.getBaggage(context.active())?.getEntry("tenant")?.value,
      ),
    )

    expect(seen).toBe("acme")

    await latitude.shutdown()
  })

  it("survives a malformed Latitude context without dropping the trace", () => {
    const carrier = {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-2222222222222222-01",
      "x-latitude-context": "{not json",
    }
    const remote = extractTraceContext(carrier)

    expect(remote.parent?.spanId).toBe("2222222222222222")
    expect(remote.context).toEqual({})
  })

  it("drops context fields that are not the type they claim", () => {
    const carrier = {
      "x-latitude-context": JSON.stringify({ sessionId: 42, tags: ["ok", 7], metadata: ["nope"] }),
    }

    expect(extractTraceContext(carrier).context).toEqual({ tags: ["ok"] })
  })

  it("lets the callee override carried context without losing the rest", () => {
    const exporter = new InMemorySpanExporter()
    const latitude = newLatitude(exporter)
    const carrier = injectTraceContext({ sessionId: "sess-1", tags: ["orchestrator"], project: "caller-project" })
    const remote = extractTraceContext(carrier)

    remote
      .getTracer(latitude, "planner", { tags: ["planner"], project: "callee-project" })
      .startSpan("x")
      .end()

    const span = find(exporter.getFinishedSpans(), "x")
    expect(span?.attributes["session.id"]).toBe("sess-1")
    expect(span?.attributes["latitude.project"]).toBe("callee-project")
    expect(JSON.parse(String(span?.attributes["latitude.tags"]))).toEqual(["orchestrator", "planner"])

    return latitude.shutdown()
  })
})
