import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import {
  createTracePayloadProtection,
  DEFAULT_TRACE_PAYLOAD_LIMITS,
  loadTracePayloadLimits,
  parseTraceContentLength,
  readTracePayload,
  TracePayloadAdmission,
  type TracePayloadRuntime,
} from "./trace-payload.ts"
import type { IngestEnv } from "./types.ts"

const textEncoder = new TextEncoder()

const streamFrom = (chunks: string[], onCancel?: () => void): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(textEncoder.encode(chunk))
      controller.close()
    },
    cancel() {
      onCancel?.()
    },
  })

const requestWithStream = (body: ReadableStream<Uint8Array>, headers?: HeadersInit): Request =>
  new Request("http://localhost/v1/traces", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" })

const testLimits = {
  maxPayloadBytes: 8,
  maxInFlightBytes: 16,
  maxConcurrentPayloads: 2,
} as const

describe("loadTracePayloadLimits", () => {
  it("requires enough capacity to assemble a maximum-size chunked payload", () => {
    const names = [
      "LAT_INGEST_TRACE_MAX_PAYLOAD_BYTES",
      "LAT_INGEST_TRACE_MAX_IN_FLIGHT_BYTES",
      "LAT_INGEST_TRACE_MAX_CONCURRENT_PAYLOADS",
    ] as const
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
    process.env.LAT_INGEST_TRACE_MAX_PAYLOAD_BYTES = "8"
    process.env.LAT_INGEST_TRACE_MAX_IN_FLIGHT_BYTES = "8"
    process.env.LAT_INGEST_TRACE_MAX_CONCURRENT_PAYLOADS = "2"

    try {
      expect(loadTracePayloadLimits).toThrow(
        "LAT_INGEST_TRACE_MAX_IN_FLIGHT_BYTES must be at least twice LAT_INGEST_TRACE_MAX_PAYLOAD_BYTES",
      )
    } finally {
      for (const name of names) {
        const value = previous[name]
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  })
})

describe("parseTraceContentLength", () => {
  it.each(["-1", "1.5", "Infinity", "1, 2", "", "9007199254740992"])("rejects invalid Content-Length %s", (value) => {
    expect(parseTraceContentLength(value, testLimits.maxPayloadBytes)).toEqual({ kind: "invalid" })
  })

  it("rejects a declared payload above the request limit", () => {
    expect(parseTraceContentLength("9", testLimits.maxPayloadBytes)).toEqual({
      kind: "too_large",
      declaredBytes: 9,
    })
  })

  it("accepts a declared payload at the request limit", () => {
    expect(parseTraceContentLength("8", testLimits.maxPayloadBytes)).toEqual({
      kind: "valid",
      declaredBytes: 8,
    })
  })
})

describe("readTracePayload", () => {
  it("reads an exact-size declared payload across chunks", async () => {
    const result = await readTracePayload({
      stream: streamFrom(["abc", "defgh"]),
      declaredBytes: 8,
      maxPayloadBytes: 8,
    })

    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(new TextDecoder().decode(result.payload)).toBe("abcdefgh")
    }
  })

  it("returns an exact-sized buffer for an unknown-length payload", async () => {
    const result = await readTracePayload({
      stream: streamFrom(["ok"]),
      maxPayloadBytes: 8,
    })

    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.payload.byteLength).toBe(2)
      expect(result.payload.buffer.byteLength).toBe(2)
    }
  })

  it("cancels an unknown-length stream when it crosses the limit", async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(textEncoder.encode("12345"))
        controller.enqueue(textEncoder.encode("6789"))
      },
      cancel() {
        cancelled = true
      },
    })

    const result = await readTracePayload({ stream, maxPayloadBytes: 8 })

    expect(result).toEqual({ kind: "too_large", observedBytes: 9 })
    expect(cancelled).toBe(true)
  })

  it("rejects bodies that do not match their declared length", async () => {
    await expect(
      readTracePayload({
        stream: streamFrom(["short"]),
        declaredBytes: 8,
        maxPayloadBytes: 8,
      }),
    ).resolves.toEqual({ kind: "length_mismatch", observedBytes: 5 })

    await expect(
      readTracePayload({
        stream: streamFrom(["toolong"]),
        declaredBytes: 4,
        maxPayloadBytes: 8,
      }),
    ).resolves.toEqual({ kind: "length_mismatch", observedBytes: 7 })
  })
})

describe("TracePayloadAdmission", () => {
  it("enforces byte and concurrency limits and releases capacity", () => {
    const admission = new TracePayloadAdmission(testLimits)
    const first = admission.tryAcquire(8)
    const second = admission.tryAcquire(8)

    expect(first.kind).toBe("acquired")
    expect(second.kind).toBe("acquired")
    expect(admission.tryAcquire(1)).toEqual({ kind: "rejected", limitedBy: "concurrency" })

    if (first.kind === "acquired") first.lease.release()
    expect(admission.tryAcquire(9)).toEqual({ kind: "rejected", limitedBy: "bytes" })

    if (second.kind === "acquired") second.lease.release()
    expect(admission.usage()).toEqual({ activePayloads: 0, reservedBytes: 0 })
  })

  it("adjusts a lease as an unknown-length payload grows", () => {
    const admission = new TracePayloadAdmission(testLimits)
    const acquired = admission.tryAcquire(0)
    expect(acquired.kind).toBe("acquired")
    if (acquired.kind !== "acquired") return

    expect(acquired.lease.reserve(6)).toBe(true)
    expect(acquired.lease.reserve(11)).toBe(false)
    expect(admission.usage()).toEqual({ activePayloads: 1, reservedBytes: 6 })

    acquired.lease.releaseReserved(2)
    expect(acquired.lease.reserve(12)).toBe(true)
    acquired.lease.release()
    expect(admission.usage()).toEqual({ activePayloads: 0, reservedBytes: 0 })
  })
})

describe("createTracePayloadProtection", () => {
  const createApp = (options?: { runtime?: TracePayloadRuntime; handlerThrows?: boolean }) => {
    const admission = new TracePayloadAdmission(testLimits)
    const protection = createTracePayloadProtection({
      limits: testLimits,
      admission,
      runtime: options?.runtime,
    })
    const app = new Hono<IngestEnv>()
    app.onError(() => new Response("error", { status: 500 }))
    app.post("/v1/traces", protection.rejectOversizedHeaders, protection.readPayload, async (c) => {
      if (options?.handlerThrows) throw new Error("boom")
      return c.json({ size: c.get("tracePayload").payload.byteLength })
    })
    return { admission, app }
  }

  it("rejects a declared oversized body in the header guard", async () => {
    const { app } = createApp()

    const response = await app.fetch(requestWithStream(streamFrom(["oversized"]), { "Content-Length": "9" }))

    expect(response.status).toBe(413)
  })

  it("rejects an invalid Content-Length in the header guard", async () => {
    const { app } = createApp()

    const response = await app.fetch(requestWithStream(streamFrom(["ok"]), { "Content-Length": "1, 2" }))

    expect(response.status).toBe(400)
  })

  it("returns 413 and releases admission when a streamed payload crosses the limit", async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(textEncoder.encode("12345"))
        controller.enqueue(textEncoder.encode("6789"))
      },
      cancel() {
        cancelled = true
      },
    })
    const { admission, app } = createApp()

    const response = await app.fetch(requestWithStream(stream))

    expect(response.status).toBe(413)
    expect(cancelled).toBe(true)
    expect(admission.usage()).toEqual({ activePayloads: 0, reservedBytes: 0 })
  })

  it("returns 503 with Retry-After when admission is exhausted", async () => {
    const { admission, app } = createApp()
    const acquired = admission.tryAcquire(16)
    expect(acquired.kind).toBe("acquired")

    const response = await app.fetch(requestWithStream(streamFrom(["ok"]), { "Content-Length": "2" }))

    expect(response.status).toBe(503)
    expect(response.headers.get("Retry-After")).toBe("1")
    if (acquired.kind === "acquired") acquired.lease.release()
  })

  it("returns 503 when a chunked payload cannot reserve assembly capacity", async () => {
    const { admission, app } = createApp()
    const existing = admission.tryAcquire(14)
    expect(existing.kind).toBe("acquired")

    const response = await app.fetch(requestWithStream(streamFrom(["ok"])))

    expect(response.status).toBe(503)
    expect(response.headers.get("Retry-After")).toBe("1")
    expect(admission.usage()).toEqual({ activePayloads: 1, reservedBytes: 14 })
    if (existing.kind === "acquired") existing.lease.release()
  })

  it("releases admission when body reading fails", async () => {
    const { admission, app } = createApp()
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("read failed"))
      },
    })

    const response = await app.fetch(requestWithStream(stream))

    expect(response.status).toBe(500)
    expect(admission.usage()).toEqual({ activePayloads: 0, reservedBytes: 0 })
  })

  it("releases admission when telemetry collection throws", async () => {
    let memoryUsageCalls = 0
    const runtime: TracePayloadRuntime = {
      now: () => 0,
      memoryUsage: () => {
        memoryUsageCalls++
        if (memoryUsageCalls === 2) throw new Error("telemetry failed")
        return { rss: 100, arrayBuffers: 25 }
      },
      getActiveSpan: () => ({ setAttributes: () => undefined }),
    }
    const { admission, app } = createApp({ runtime })

    const response = await app.fetch(requestWithStream(streamFrom(["ok"]), { "Content-Length": "2" }))

    expect(response.status).toBe(500)
    expect(admission.usage()).toEqual({ activePayloads: 0, reservedBytes: 0 })
  })

  it("releases admission without overwriting telemetry when downstream handling throws", async () => {
    const attributes: Record<string, unknown> = {}
    const runtime: TracePayloadRuntime = {
      now: (() => {
        const values = [10, 15]
        return () => values.shift() ?? 15
      })(),
      memoryUsage: () => ({ rss: 100, arrayBuffers: 25 }),
      getActiveSpan: () => ({
        setAttributes: (values) => Object.assign(attributes, values),
      }),
    }
    const { admission, app } = createApp({ handlerThrows: true, runtime })

    const response = await app.fetch(requestWithStream(streamFrom(["ok"]), { "Content-Length": "2" }))

    expect(response.status).toBe(500)
    expect(admission.usage()).toEqual({ activePayloads: 0, reservedBytes: 0 })
    expect(attributes).toMatchObject({
      "latitude.ingest.payload.outcome": "accepted",
      "latitude.ingest.payload.size_bytes": 2,
    })
  })

  it("records payload and memory attributes on the active request span", async () => {
    const attributes: Record<string, unknown> = {}
    const runtime: TracePayloadRuntime = {
      now: (() => {
        const values = [10, 15]
        return () => values.shift() ?? 15
      })(),
      memoryUsage: () => ({ rss: 100, arrayBuffers: 25 }),
      getActiveSpan: () => ({
        setAttributes: (values) => Object.assign(attributes, values),
      }),
    }
    const { app } = createApp({ runtime })

    const response = await app.fetch(
      requestWithStream(streamFrom(["okay"]), {
        "Content-Length": "4",
        "Content-Type": "application/json; charset=utf-8",
      }),
    )

    expect(response.status).toBe(200)
    expect(attributes).toMatchObject({
      "latitude.ingest.payload.size_bytes": 4,
      "latitude.ingest.payload.declared_size_bytes": 4,
      "latitude.ingest.payload.content_type": "application/json",
      "latitude.ingest.body_read.duration_ms": 5,
      "latitude.ingest.memory.rss_bytes": 100,
      "latitude.ingest.memory.array_buffers_bytes": 25,
      "latitude.ingest.payload.outcome": "accepted",
    })
  })

  it("returns 413 through the Node server adapter for a chunked oversized body", async () => {
    const { app } = createApp()
    const server = serve({ fetch: app.fetch, port: 0 })
    await new Promise<void>((resolve, reject) => {
      if (server.listening) return resolve()
      server.once("listening", resolve)
      server.once("error", reject)
    })

    try {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("Expected a TCP server address")
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/traces`, {
        method: "POST",
        body: streamFrom(["12345", "6789"]),
        duplex: "half",
      } as RequestInit & { duplex: "half" })

      expect(response.status).toBe(413)
      await response.body?.cancel()
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it("uses production-safe default limits", () => {
    expect(DEFAULT_TRACE_PAYLOAD_LIMITS).toEqual({
      maxPayloadBytes: 32 * 1024 * 1024,
      maxInFlightBytes: 64 * 1024 * 1024,
      maxConcurrentPayloads: 16,
    })
  })
})
