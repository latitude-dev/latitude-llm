import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { gunzipSync, gzipSync } from "node:zlib"
import { afterEach, expect, test, vi } from "vitest"
import { createClickhouseClient } from "./client.ts"

interface RequestObservation {
  readonly encoding: string | undefined
  readonly wireBytes: number
  readonly decodedBytes: number
  readonly responseCompressed: boolean
}

async function exchange(compression?: boolean) {
  const rows = Array.from({ length: 200 }, (_, id) => ({ id, value: "repeated telemetry attribute ".repeat(10) }))
  const observations: RequestObservation[] = []

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)
    const encoding = request.headers["content-encoding"]
    const decoded = encoding === "gzip" ? gunzipSync(body) : body
    const url = new URL(request.url ?? "/", "http://localhost")
    const responseCompressed =
      url.searchParams.get("enable_http_compression") === "1" &&
      request.headers["accept-encoding"]?.includes("gzip") === true
    observations.push({ encoding, wireBytes: body.length, decodedBytes: decoded.length, responseCompressed })

    if (observations.length === 1) {
      expect(
        decoded
          .toString()
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
      ).toEqual(rows)
      response.end()
      return
    }

    const output = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
    response.setHeader("content-type", "application/x-ndjson")
    if (responseCompressed) response.setHeader("content-encoding", "gzip")
    response.end(responseCompressed ? gzipSync(output) : output)
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      response.statusCode = 500
      response.end(error instanceof Error ? error.message : "Request failed")
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Expected a TCP listener")

  const client = createClickhouseClient({
    url: `http://127.0.0.1:${address.port}`,
    username: "test",
    password: "test",
    database: "test",
    ...(compression !== undefined ? { compression } : {}),
  })
  try {
    await client.insert({ table: "events", values: rows, format: "JSONEachRow" })
    const result = await client.query({ query: "SELECT id, value FROM events", format: "JSONEachRow" })
    expect(await result.json()).toEqual(rows)
    return observations
  } finally {
    await client.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

afterEach(() => vi.unstubAllEnvs())

test("the opt-in setting compresses inserts and decodes negotiated gzip results", async () => {
  vi.stubEnv("LAT_CLICKHOUSE_COMPRESSION_ENABLED", "true")
  const requests = await exchange()
  expect(requests).toHaveLength(2)
  expect(requests[0].encoding).toBe("gzip")
  expect(requests[0].wireBytes).toBeLessThan(requests[0].decodedBytes)
  expect(requests[1].responseCompressed).toBe(true)
})

test("an explicit disable overrides the environment setting", async () => {
  vi.stubEnv("LAT_CLICKHOUSE_COMPRESSION_ENABLED", "true")
  const requests = await exchange(false)
  expect(requests[0].encoding).toBeUndefined()
  expect(requests[0].wireBytes).toBe(requests[0].decodedBytes)
  expect(requests[1].responseCompressed).toBe(false)
})

test("compression remains disabled when the setting is absent", async () => {
  vi.stubEnv("LAT_CLICKHOUSE_COMPRESSION_ENABLED", undefined)
  const requests = await exchange()
  expect(requests[0].encoding).toBeUndefined()
  expect(requests[1].responseCompressed).toBe(false)
})
