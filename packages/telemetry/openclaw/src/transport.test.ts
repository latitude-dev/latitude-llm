import { describe, expect, it, vi } from "vitest"
import { Transport } from "./transport.ts"
import type { OtlpExportRequest } from "./types.ts"

const payload: OtlpExportRequest = {
  resourceSpans: [{ resource: { attributes: [] }, scopeSpans: [{ scope: { name: "s", version: "1" }, spans: [] }] }],
}
const logger = { debug: vi.fn(), warn: vi.fn() }

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response("body", { status, headers })
}

describe("Transport", () => {
  it("posts to /v1/traces with the project header and bearer token", async () => {
    const fetchImpl = vi.fn(async () => response(200))
    const t = new Transport({
      baseUrl: "https://ingest.example///",
      apiKey: "k",
      project: "p",
      logger,
      fetchImpl,
      sleep: async () => {},
    })
    t.enqueue(payload)
    await t.flush(1000)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://ingest.example/v1/traces")
    expect((init.headers as Record<string, string>)["X-Latitude-Project"]).toBe("p")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k")
  })

  it("retries 429 and 5xx, honouring Retry-After, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, { "retry-after": "1" }))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200))
    const sleep = vi.fn(async (_ms: number) => {})
    const t = new Transport({ baseUrl: "https://i", apiKey: "k", project: "p", logger, fetchImpl, sleep })
    t.enqueue(payload)
    await t.flush(1000)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls[0]?.[0]).toBe(1000)
  })

  it("never retries a 4xx other than 429", async () => {
    const fetchImpl = vi.fn(async () => response(401))
    const t = new Transport({
      baseUrl: "https://i",
      apiKey: "k",
      project: "p",
      logger,
      fetchImpl,
      sleep: async () => {},
    })
    t.enqueue(payload)
    await t.flush(1000)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("HTTP 401"))
  })

  it("gives up after the attempt budget on network errors and keeps the queue moving", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(response(200))
    const t = new Transport({
      baseUrl: "https://i",
      apiKey: "k",
      project: "p",
      logger,
      fetchImpl,
      sleep: async () => {},
      maxAttempts: 2,
    })
    t.enqueue(payload)
    t.enqueue(payload)
    await t.flush(1000)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
