import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  httpRequestWithFetch,
  IMPORT_REQUEST_TIMEOUT_MS,
  parseJson,
  requireOk,
  stringifyMetadata,
} from "./http-client.ts"

const response = (status: number, headers: Record<string, string> = {}, body = "{}") => ({
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  body,
})

describe("requireOk", () => {
  it.each([200, 201, 204, 299])("passes a %d response through", async (status) => {
    const ok = await Effect.runPromise(requireOk(response(status), "ctx"))

    expect(ok.status).toBe(status)
  })

  it.each([
    [401, "auth", false],
    [403, "auth", false],
    [429, "rate_limited", true],
    [500, "server_error", true],
    [502, "server_error", true],
    [400, "config", false],
    [404, "config", false],
  ] as const)("maps %d to a %s error", async (status, category, retryable) => {
    await expect(Effect.runPromise(requireOk(response(status), "ctx"))).rejects.toMatchObject({
      category,
      retryable,
      upstreamStatus: status,
    })
  })

  it("prefixes the failure with the caller's context", async () => {
    await expect(Effect.runPromise(requireOk(response(500), "Langfuse fetch page"))).rejects.toMatchObject({
      message: "Langfuse fetch page: upstream server error",
    })
  })

  it("never echoes the upstream body", async () => {
    const secretBody = JSON.stringify({ error: "token sk-live-123 is invalid" })

    await expect(Effect.runPromise(requireOk(response(400, {}, secretBody), "ctx"))).rejects.not.toMatchObject({
      message: expect.stringContaining("sk-live-123"),
    })
  })
})

describe("Retry-After parsing", () => {
  it("reads a delay expressed in seconds", async () => {
    await expect(Effect.runPromise(requireOk(response(429, { "retry-after": "30" }), "ctx"))).rejects.toMatchObject({
      retryAfterMs: 30_000,
    })
  })

  it("reads a delay expressed as an HTTP date", async () => {
    const future = new Date(Date.now() + 45_000).toUTCString()

    const error = await Effect.runPromise(requireOk(response(429, { "retry-after": future }), "ctx").pipe(Effect.flip))

    expect(error.retryAfterMs).toBeGreaterThan(40_000)
    expect(error.retryAfterMs).toBeLessThanOrEqual(45_000)
  })

  it("clamps a past HTTP date to zero rather than going negative", async () => {
    const past = new Date(Date.now() - 60_000).toUTCString()

    await expect(Effect.runPromise(requireOk(response(429, { "retry-after": past }), "ctx"))).rejects.toMatchObject({
      retryAfterMs: 0,
    })
  })

  it("clamps a negative seconds value to zero, so no backoff inherits a negative delay", async () => {
    await expect(Effect.runPromise(requireOk(response(429, { "retry-after": "-5" }), "ctx"))).rejects.toMatchObject({
      retryAfterMs: 0,
    })
  })

  it("omits the hint when the header is absent", async () => {
    const error = await Effect.runPromise(requireOk(response(429), "ctx").pipe(Effect.flip))

    expect(error.retryAfterMs).toBeUndefined()
  })

  it("omits the hint when the header is unparseable", async () => {
    const error = await Effect.runPromise(requireOk(response(429, { "retry-after": "soon" }), "ctx").pipe(Effect.flip))

    expect(error.retryAfterMs).toBeUndefined()
  })

  it("only attaches the hint to rate-limit errors", async () => {
    const error = await Effect.runPromise(requireOk(response(500, { "retry-after": "30" }), "ctx").pipe(Effect.flip))

    expect(error.category).toBe("server_error")
    expect(error.retryAfterMs).toBeUndefined()
  })
})

describe("parseJson", () => {
  it("parses a JSON body", async () => {
    const parsed = await Effect.runPromise(parseJson<{ a: number }>(response(200, {}, '{"a":1}')))

    expect(parsed).toEqual({ a: 1 })
  })

  it("maps malformed JSON to a non-retryable mapping error", async () => {
    await expect(Effect.runPromise(parseJson(response(200, {}, "not json")))).rejects.toMatchObject({
      category: "mapping",
      retryable: false,
      upstreamStatus: 200,
    })
  })
})

describe("httpRequestWithFetch", () => {
  it("defaults to GET and forwards headers and body", async () => {
    const calls: Array<{ url: string; init: Record<string, unknown> }> = []
    const request = httpRequestWithFetch(async (url, init) => {
      calls.push({ url, init: init as Record<string, unknown> })
      return { status: 200, headers: { get: () => null }, text: async () => "{}" }
    })

    await Effect.runPromise(request({ url: "https://example.com", headers: { a: "b" } }))

    expect(calls[0]?.init.method).toBe("GET")
    expect(calls[0]?.init.headers).toEqual({ a: "b" })
    expect(calls[0]?.init.body).toBeUndefined()
  })

  it("always attaches an abort signal so a hung socket is released", async () => {
    let signal: AbortSignal | undefined
    const request = httpRequestWithFetch(async (_url, init) => {
      signal = (init as { signal?: AbortSignal }).signal
      return { status: 200, headers: { get: () => null }, text: async () => "{}" }
    })

    await Effect.runPromise(request({ url: "https://example.com" }))

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(false)
  })

  it("honours a caller-supplied signal over the default timeout", async () => {
    const controller = new AbortController()
    let signal: AbortSignal | undefined
    const request = httpRequestWithFetch(async (_url, init) => {
      signal = (init as { signal?: AbortSignal }).signal
      return { status: 200, headers: { get: () => null }, text: async () => "{}" }
    })

    await Effect.runPromise(request({ url: "https://example.com", signal: controller.signal }))

    expect(signal).toBe(controller.signal)
  })

  it("aborts once the configured timeout elapses", async () => {
    const request = httpRequestWithFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal }).signal
          signal?.addEventListener("abort", () => reject(new Error("aborted")))
        }),
    )

    await expect(Effect.runPromise(request({ url: "https://example.com", timeoutMs: 10 }))).rejects.toMatchObject({
      category: "transport",
      retryable: true,
    })
  })

  it("maps a transport failure to a retryable error", async () => {
    const request = httpRequestWithFetch(async () => {
      throw new Error("ECONNRESET")
    })

    await expect(Effect.runPromise(request({ url: "https://example.com" }))).rejects.toMatchObject({
      category: "transport",
      retryable: true,
      message: "ECONNRESET",
    })
  })

  it("keeps the per-request budget under the engine's page budget", () => {
    expect(IMPORT_REQUEST_TIMEOUT_MS).toBeLessThan(120_000)
  })
})

describe("stringifyMetadata", () => {
  it("passes string values through and JSON-encodes the rest", () => {
    expect(stringifyMetadata({ a: "x", b: 1, c: { d: true }, e: [1, 2] })).toEqual({
      a: "x",
      b: "1",
      c: '{"d":true}',
      e: "[1,2]",
    })
  })

  it.each([
    [null, {}],
    [undefined, {}],
  ])("returns an empty record for %s", (value, expected) => {
    expect(stringifyMetadata(value)).toEqual(expected)
  })

  it("wraps a primitive under a value key", () => {
    expect(stringifyMetadata("plain")).toEqual({ value: "plain" })
    expect(stringifyMetadata(42)).toEqual({ value: "42" })
  })

  it("wraps an array under a value key", () => {
    expect(stringifyMetadata([1, 2])).toEqual({ value: "1,2" })
  })
})
