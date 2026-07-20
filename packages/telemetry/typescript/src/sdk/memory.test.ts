import { context, propagation, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-node"
import { afterEach, describe, expect, it } from "vitest"
import { capture } from "./context.ts"
import { Latitude } from "./init.ts"
import { createMemoryTelemetry } from "./memory.ts"

function attr(span: { attributes: Record<string, unknown> }, name: string) {
  return span.attributes[name]
}

function newLatitude() {
  const exporter = new InMemorySpanExporter()
  const latitude = new Latitude({ apiKey: "test-key", project: "test-project", exporter, disableBatch: true })
  return { exporter, latitude }
}

describe("createMemoryTelemetry", () => {
  afterEach(() => {
    trace.disable()
    context.disable()
    propagation.disable()
  })

  it("emits a create_memory span with identity attributes and no content by default", async () => {
    const { exporter, latitude } = newLatitude()
    const memory = createMemoryTelemetry({ latitude, storeId: "prefs" })

    await memory.create({ recordId: "mem_1", records: [{ content: "likes tea" }] })
    await latitude.flush()

    const span = exporter.getFinishedSpans().find((s) => s.name === "create_memory")
    expect(span).toBeDefined()
    expect(span?.instrumentationScope.name).toBe("so.latitude.instrumentation.memory")
    expect(span ? attr(span, "gen_ai.operation.name") : undefined).toBe("create_memory")
    expect(span ? attr(span, "gen_ai.memory.store.id") : undefined).toBe("prefs")
    expect(span ? attr(span, "gen_ai.memory.record.id") : undefined).toBe("mem_1")
    expect(span ? attr(span, "gen_ai.memory.record.count") : undefined).toBe(1)
    expect(Number.isInteger(span ? attr(span, "gen_ai.memory.record.count") : undefined)).toBe(true)
    expect(span ? attr(span, "gen_ai.memory.records") : undefined).toBeUndefined()

    await latitude.shutdown()
  })

  it("sends record content as a valid JSON array only when captureContent is on, applying redact", async () => {
    const { exporter, latitude } = newLatitude()
    const memory = createMemoryTelemetry({
      latitude,
      storeId: "prefs",
      captureContent: true,
      redact: (records) => records.map((r) => ({ ...r, content: "[redacted]" })),
    })

    await memory.update({
      recordId: "mem_1",
      records: [{ id: "mem_1", content: "likes tea", metadata: { source: "chat" } }],
    })
    await latitude.flush()

    const span = exporter.getFinishedSpans().find((s) => s.name === "update_memory")
    const raw = span ? attr(span, "gen_ai.memory.records") : undefined
    expect(typeof raw).toBe("string")

    const parsed = JSON.parse(raw as string)
    // Contract self-check: the exact shape ingest validates (non-empty array, every element has `content`).
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
    expect(parsed.every((r: { content?: unknown }) => "content" in r)).toBe(true)
    expect(parsed[0].content).toBe("[redacted]")

    await latitude.shutdown()
  })

  it("wraps execute, returns its result, and stamps context attributes", async () => {
    const { exporter, latitude } = newLatitude()
    const memory = createMemoryTelemetry({
      latitude,
      storeId: "prefs",
      context: { sessionId: "sess-1", userId: "user-1", project: "test-project" },
    })

    const result = await memory.create({
      recordId: "mem_1",
      records: [{ content: "hi" }],
      execute: async () => ({ ok: true }),
    })

    expect(result).toEqual({ ok: true })
    await latitude.flush()

    const span = exporter.getFinishedSpans().find((s) => s.name === "create_memory")
    expect(span ? attr(span, "session.id") : undefined).toBe("sess-1")
    expect(span ? attr(span, "user.id") : undefined).toBe("user-1")
    expect(span ? attr(span, "latitude.project") : undefined).toBe("test-project")

    await latitude.shutdown()
  })

  it("records exceptions and rethrows when execute fails", async () => {
    const { exporter, latitude } = newLatitude()
    const memory = createMemoryTelemetry({ latitude, storeId: "prefs" })

    await expect(
      memory.upsert({
        recordId: "mem_1",
        execute: async () => {
          throw new Error("boom")
        },
      }),
    ).rejects.toThrow("boom")
    await latitude.flush()

    const span = exporter.getFinishedSpans().find((s) => s.name === "upsert_memory")
    expect(span?.status.message).toBe("boom")
    expect(span?.events.some((e) => e.name === "exception")).toBe(true)

    await latitude.shutdown()
  })

  it("maps search results to records and always sets the returned count", async () => {
    const { exporter, latitude } = newLatitude()
    const memory = createMemoryTelemetry({ latitude, storeId: "prefs" })

    const hits = [
      { id: "mem_1", content: "likes tea", score: 0.9 },
      { id: "mem_2", content: "lives in Barcelona", score: 0.7 },
    ]
    const result = await memory.search({
      query: "preferences",
      execute: async () => hits,
      recordsFromResult: (r) => r,
    })

    expect(result).toBe(hits)
    await latitude.flush()

    const span = exporter.getFinishedSpans().find((s) => s.name === "search_memory")
    expect(span ? attr(span, "gen_ai.memory.query.text") : undefined).toBe("preferences")
    expect(span ? attr(span, "gen_ai.memory.record.count") : undefined).toBe(2)
    // Count of returned records is not content, so it rides even with capture off.
    expect(span ? attr(span, "gen_ai.memory.records") : undefined).toBeUndefined()

    await latitude.shutdown()
  })

  it("treats a delete without recordId as a whole-store wipe", async () => {
    const { exporter, latitude } = newLatitude()
    const memory = createMemoryTelemetry({ latitude })

    await memory.delete({ storeId: "prefs" })
    await memory.createStore({ storeId: "prefs" })
    await latitude.flush()

    const del = exporter.getFinishedSpans().find((s) => s.name === "delete_memory")
    expect(del ? attr(del, "gen_ai.memory.store.id") : undefined).toBe("prefs")
    expect(del ? attr(del, "gen_ai.memory.record.id") : undefined).toBeUndefined()

    const createStore = exporter.getFinishedSpans().find((s) => s.name === "create_memory_store")
    expect(createStore ? attr(createStore, "gen_ai.operation.name") : undefined).toBe("create_memory_store")

    await latitude.shutdown()
  })

  it("inherits latitude context from an enclosing capture()", async () => {
    const cm = new AsyncLocalStorageContextManager()
    cm.enable()
    context.setGlobalContextManager(cm)

    const { exporter, latitude } = newLatitude()
    const memory = createMemoryTelemetry({ latitude, storeId: "prefs" })

    await capture("agent-run", async () => memory.create({ recordId: "mem_1" }), {
      sessionId: "sess-9",
      userId: "user-9",
    })
    await latitude.flush()

    const span = exporter.getFinishedSpans().find((s) => s.name === "create_memory")
    expect(span ? attr(span, "session.id") : undefined).toBe("sess-9")
    expect(span ? attr(span, "user.id") : undefined).toBe("user-9")

    await latitude.shutdown()
  })
})
