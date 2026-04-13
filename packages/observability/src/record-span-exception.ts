import type { Span } from "@opentelemetry/api"

const toError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)))

export function recordSpanExceptionForDatadog(span: Span, error: unknown): Error {
  const err = toError(error)
  span.recordException(err)
  span.setAttributes({
    "error.message": err.message,
    "error.stack": err.stack ?? "",
    "error.type": err.constructor.name,
  })
  return err
}
