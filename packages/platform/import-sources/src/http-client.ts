import { ImportSourceError } from "@domain/imports"
import { Effect } from "effect"

/**
 * Per-request ceiling, below the engine's 120s page budget so a slow source surfaces
 * as a retryable transport error rather than being cut off by the page timeout.
 */
export const IMPORT_REQUEST_TIMEOUT_MS = 60_000

interface HttpResponse {
  readonly status: number
  readonly headers: { get(name: string): string | null }
  readonly body: string
}

interface HttpFetchResponse {
  readonly status: number
  readonly headers: { get(name: string): string | null }
  text(): Promise<string>
}

interface HttpRequestInit {
  readonly method?: string
  readonly headers?: Record<string, string>
  readonly body?: string
  readonly signal?: AbortSignal
}

type HttpRequestFetch = (url: string, init: HttpRequestInit) => Promise<HttpFetchResponse>

export const httpRequestWithFetch =
  (fetchImpl: HttpRequestFetch) =>
  (input: {
    readonly url: string
    readonly method?: string
    readonly headers?: Record<string, string>
    readonly body?: string
    readonly signal?: AbortSignal
    readonly timeoutMs?: number
  }): Effect.Effect<HttpResponse, ImportSourceError> =>
    Effect.tryPromise({
      try: async () => {
        // Aborting the request itself is what frees the socket; an Effect-level
        // timeout alone would leave the connection open behind an orphaned promise.
        const signal = input.signal ?? AbortSignal.timeout(input.timeoutMs ?? IMPORT_REQUEST_TIMEOUT_MS)
        const response = await fetchImpl(input.url, {
          method: input.method ?? "GET",
          ...(input.headers !== undefined ? { headers: input.headers } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          signal,
        })
        const body = await response.text()
        return { status: response.status, headers: response.headers, body }
      },
      catch: (cause) =>
        new ImportSourceError({
          category: "transport",
          message: cause instanceof Error ? cause.message : "Network request failed",
          retryable: true,
        }),
    })

export const httpRequest = httpRequestWithFetch((url, init) => fetch(url, init))

/**
 * Bytes rather than text, for an attachment a source stored out of line.
 *
 * Sent with no headers of ours. These URLs carry their own signature in the query string, and an
 * `Authorization` header beside it is what object stores answer "only one auth mechanism" to.
 */
export const httpRequestBinary = (input: {
  readonly url: string
  readonly timeoutMs?: number
}): Effect.Effect<{ readonly status: number; readonly bytes: Uint8Array }, ImportSourceError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(input.url, {
        signal: AbortSignal.timeout(input.timeoutMs ?? IMPORT_REQUEST_TIMEOUT_MS),
      })
      return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) }
    },
    catch: (cause) =>
      new ImportSourceError({
        category: "transport",
        message: cause instanceof Error ? cause.message : "Binary request failed",
        retryable: true,
      }),
  })

const parseRetryAfterMs = (headers: { get(name: string): string | null }): number | undefined => {
  const value = headers.get("retry-after")
  if (!value) return undefined
  const seconds = Number.parseInt(value, 10)
  // Clamped like the HTTP-date branch: a negative header would otherwise become a
  // negative delay that every downstream backoff calculation inherits.
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return undefined
}

const mapHttpError = (response: HttpResponse, context: string): ImportSourceError => {
  const retryAfterMs = parseRetryAfterMs(response.headers)

  if (response.status === 401 || response.status === 403) {
    return new ImportSourceError({
      category: "auth",
      message: `${context}: authentication failed`,
      retryable: false,
      upstreamStatus: response.status,
    })
  }

  if (response.status === 429) {
    return new ImportSourceError({
      category: "rate_limited",
      message: `${context}: rate limited`,
      retryable: true,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      upstreamStatus: response.status,
    })
  }

  if (response.status >= 500) {
    return new ImportSourceError({
      category: "server_error",
      message: `${context}: upstream server error`,
      retryable: true,
      upstreamStatus: response.status,
    })
  }

  return new ImportSourceError({
    category: "config",
    message: `${context}: request failed (${response.status})`,
    retryable: false,
    upstreamStatus: response.status,
  })
}

export const requireOk = (response: HttpResponse, context: string): Effect.Effect<HttpResponse, ImportSourceError> => {
  if (response.status >= 200 && response.status < 300) return Effect.succeed(response)
  return Effect.fail(mapHttpError(response, context))
}

export const parseJson = <T>(response: HttpResponse): Effect.Effect<T, ImportSourceError> =>
  Effect.try({
    try: () => JSON.parse(response.body) as T,
    catch: () =>
      new ImportSourceError({
        category: "mapping",
        message: "Invalid JSON response",
        retryable: false,
        upstreamStatus: response.status,
      }),
  })

export const stringifyMetadata = (value: unknown): Record<string, string> => {
  if (value === null || value === undefined) return {}
  if (typeof value !== "object" || Array.isArray(value)) {
    return { value: String(value) }
  }
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = typeof entry === "string" ? entry : JSON.stringify(entry)
  }
  return result
}
