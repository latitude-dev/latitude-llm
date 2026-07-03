import type { DomainError } from "@domain/shared"
import type { Span } from "@repo/observability"
import { recordSpanExceptionForDatadog, SpanStatusCode } from "@repo/observability"
import { isHttpError } from "@repo/utils"

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
