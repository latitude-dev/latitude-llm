import type { Effect as EffectType } from "effect"
import { Effect } from "effect"
import type { Hono } from "hono"

/**
 * Test request options for Hono app testing
 */
export interface TestRequestOptions {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  readonly path: string
  readonly headers?: Record<string, string> | undefined
  readonly body?: unknown | undefined
}

/**
 * Test response wrapper with convenience methods
 */
export interface TestResponse {
  readonly raw: Response
  readonly status: number
  readonly ok: boolean
  json<T>(): Promise<T>
  text(): Promise<string>
}

/**
 * Create a test response wrapper
 */
const createTestResponse = (response: Response): TestResponse => ({
  raw: response,
  status: response.status,
  ok: response.ok,
  json: async <T>() => response.json() as Promise<T>,
  text: async () => response.text(),
})

/**
 * Create a test client for a Hono app
 *
 * Allows testing routes without starting an HTTP server.
 * Uses Hono's app.fetch() directly for fast, lightweight tests.
 */
export const createTestClient = (app: Hono) => {
  const makeRequest = async (options: TestRequestOptions): Promise<TestResponse> => {
    const url = `http://localhost${options.path}`
    const method = options.method

    const headers: Record<string, string> = options.headers ?? {}

    let body: string | null = null
    if (options.body !== undefined) {
      body = JSON.stringify(options.body)
      headers["Content-Type"] = "application/json"
    }

    const request = new Request(url, {
      method,
      headers,
      body,
    })

    const response = await app.fetch(request)
    return createTestResponse(response)
  }

  return {
    get: (path: string, headers?: Record<string, string> | undefined) => makeRequest({ method: "GET", path, headers }),
    post: (path: string, body?: unknown, headers?: Record<string, string> | undefined) =>
      makeRequest({ method: "POST", path, body, headers }),
    put: (path: string, body?: unknown, headers?: Record<string, string> | undefined) =>
      makeRequest({ method: "PUT", path, body, headers }),
    patch: (path: string, body?: unknown, headers?: Record<string, string> | undefined) =>
      makeRequest({ method: "PATCH", path, body, headers }),
    delete: (path: string, headers?: Record<string, string> | undefined) =>
      makeRequest({ method: "DELETE", path, headers }),
    request: makeRequest,
  }
}

/**
 * Type for the test client returned by createTestClient
 */
export type TestClient = ReturnType<typeof createTestClient>

/**
 * Create a test client wrapped in Effect
 */
export const createTestClientEffect = (app: Hono): EffectType.Effect<TestClient, never> => {
  return Effect.sync(() => createTestClient(app))
}
