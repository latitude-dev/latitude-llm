import type { DomainError } from "@domain/shared"
import type { Span, Tracer } from "@repo/observability"
import {
  createLogger,
  initializeObservability,
  recordSpanExceptionForDatadog,
  SpanStatusCode,
  trace,
} from "@repo/observability"
import { isHttpError } from "@repo/utils"
import { createMiddleware, createStart } from "@tanstack/react-start"

type Logger = ReturnType<typeof createLogger>

type ServerFnMeta = {
  readonly id?: string
  readonly name?: string
  readonly filename?: string
}

type ServerFnMiddlewareArgs = {
  readonly data?: unknown
  readonly request?: Request
  readonly serverFnMeta?: ServerFnMeta
}

const getStringField = (value: unknown, key: string): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === "string" && field.length > 0 ? field : undefined
}

const getDataKeys = (data: unknown): string[] => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return []
  return Object.keys(data).sort()
}

const SERVER_FN_ID_PATTERN = /^\/[A-Za-z0-9_-]+\/([a-f0-9]{64})$/

const getServerFnIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(SERVER_FN_ID_PATTERN)
  return match?.[1]
}

type ServerFnErrorInfo = {
  readonly error: Error
  readonly tag: string | undefined
  readonly message: string
  readonly status: number
  readonly isClientError: boolean
}

const errorTag = (e: unknown): string | undefined =>
  typeof e === "object" && e !== null && "_tag" in (e as DomainError) ? (e as DomainError)._tag : undefined

const errorStatus = (e: unknown): number => (isHttpError(e) ? e.httpStatus : 500)

// A 4xx means the caller was rejected as designed (not logged in, no access,
// bad input) — expected control flow, not a server fault. Such errors are kept
// out of Datadog Error Tracking so real (5xx) bugs aren't buried; the span
// still carries http.status_code for APM/metrics. Anything ≥ 500 or non-HTTP
// (treated as 500) is recorded as before.
const isExpectedClientError = (status: number): boolean => status >= 400 && status < 500

/**
 * Records a request-level error onto its span unless it's an expected 4xx.
 * Used by the request middleware, which also sees the re-thrown server-fn error
 * — see `recordServerFnError`, which tags that error with `httpStatus` so it
 * stays classifiable here even though it is a plain `Error`.
 */
export const recordRequestError = (span: Span, error: unknown): void => {
  if (isExpectedClientError(errorStatus(error))) return
  recordSpanExceptionForDatadog(span, error)
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  })
}

/**
 * Records a thrown server-fn error onto its span and shapes it for re-throwing.
 * The re-thrown `Error` carries the original `httpStatus`/`httpMessage` (as
 * non-enumerable props, so they don't leak into the client-bound JSON message)
 * so the request middleware can recognise a 4xx and likewise skip recording it.
 */
export const recordServerFnError = (span: Span, e: unknown): ServerFnErrorInfo => {
  const httpError = isHttpError(e)
  const tag = errorTag(e)
  const message = httpError ? e.httpMessage : e instanceof Error ? e.message : "Unknown error occurred"
  const status = httpError ? e.httpStatus : 500
  const isClientError = isExpectedClientError(status)

  if (!isClientError) {
    recordSpanExceptionForDatadog(span, e)
    span.setStatus({ code: SpanStatusCode.ERROR, message })
  }

  const error = new Error(JSON.stringify({ _tag: tag, message, status }))
  if (e instanceof Error && e.stack) error.stack = e.stack
  Object.defineProperty(error, "httpStatus", { value: status })
  Object.defineProperty(error, "httpMessage", { value: message })

  return { error, tag, message, status, isClientError }
}

export const tracingRequestMiddleware = ({ tracer }: { tracer: Tracer }) =>
  createMiddleware({ type: "request" }).server(async ({ next, request }) => {
    const url = new URL(request.url)

    return tracer.startActiveSpan(`${request.method} ${url.pathname}`, async (span: Span) => {
      span.setAttributes({
        "http.method": request.method,
        "http.url": request.url,
        "http.route": url.pathname,
        "http.host": url.host,
      })

      try {
        const result = await next()
        if (result.response) {
          span.setAttribute("http.status_code", result.response.status)
          span.setStatus({ code: SpanStatusCode.OK })
        }
        return result
      } catch (error) {
        recordRequestError(span, error)
        throw error
      } finally {
        span.end()
      }
    })
  })

export const tracingFnMiddleware = ({ tracer, logger }: { tracer: Tracer; logger: Logger }) =>
  createMiddleware({ type: "function" }).server(async (rawArgs) => {
    const args = rawArgs as typeof rawArgs & ServerFnMiddlewareArgs
    const request = args.request
    const url = request ? new URL(request.url) : undefined
    const serverFnMeta = args.serverFnMeta
    const serverFnName = serverFnMeta?.name
    const serverFnId = serverFnMeta?.id ?? (url ? getServerFnIdFromPath(url.pathname) : undefined)
    const route = serverFnName ? `/_serverFn/${serverFnName}` : url?.pathname
    const spanName = serverFnName
      ? `server-fn ${serverFnName}`
      : request && url
        ? `server-fn ${request.method} ${url.pathname}`
        : "server-fn"

    return tracer.startActiveSpan(spanName, async (span: Span) => {
      if (request && url) {
        span.setAttributes({
          "http.method": request.method,
          "http.url": request.url,
          "http.route": route ?? url.pathname,
          "http.host": url.host,
        })
      }

      if (serverFnName) span.updateName(`server-fn ${serverFnName}`)

      const dataKeys = getDataKeys(args.data)
      const projectId = getStringField(args.data, "projectId")
      const traceId = getStringField(args.data, "traceId")
      const signalId = getStringField(args.data, "signalId")
      const datasetId = getStringField(args.data, "datasetId")

      span.setAttributes({
        "server_fn.name": serverFnName ?? "unknown",
        "server_fn.id": serverFnId ?? "unknown",
        "server_fn.filename": serverFnMeta?.filename ?? "unknown",
        "server_fn.input.keys": dataKeys.join(","),
        "server_fn.input.has_project_id": projectId !== undefined,
        "server_fn.input.has_trace_id": traceId !== undefined,
      })
      if (projectId) span.setAttribute("project.id", projectId)
      if (traceId) span.setAttribute("trace.trace_id", traceId)
      if (signalId) span.setAttribute("issue.id", signalId)
      if (datasetId) span.setAttribute("dataset.id", datasetId)

      try {
        const result = await rawArgs.next()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (e) {
        const { error, tag, message, status, isClientError } = recordServerFnError(span, e)

        const log = isClientError ? logger.warn : logger.error
        log({
          _tag: tag,
          message,
          status,
          serverFnName,
          serverFnId,
          serverFnFilename: serverFnMeta?.filename,
          dataKeys,
          hasProjectId: projectId !== undefined,
          hasTraceId: traceId !== undefined,
        })

        throw error
      } finally {
        span.end()
      }
    })
  })

export const startInstance = createStart(async () => {
  await initializeObservability({ serviceName: "web" })

  const tracer = trace.getTracer("web")
  const logger = createLogger("server-fn")

  return {
    requestMiddleware: [tracingRequestMiddleware({ tracer })],
    functionMiddleware: [tracingFnMiddleware({ tracer, logger })],
  }
})
