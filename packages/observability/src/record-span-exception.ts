import type { Span } from "@opentelemetry/api"

const toError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)))

/**
 * Strip `file://` protocol from stack traces so Datadog can match frames
 * against uploaded sourcemaps (which use bare `/app/...` path prefixes).
 * Node.js ESM (used by Nitro/Vinxi in apps/web) includes `file://` in
 * stack frames, but the other apps emit plain paths — this is a no-op for them.
 */
const normalizeStack = (stack: string): string => stack.replaceAll("file://", "")

export function recordSpanExceptionForDatadog(span: Span, error: unknown): Error {
  const err = toError(error)
  span.recordException(err)
  span.setAttributes({
    "error.message": err.message,
    "error.stack": normalizeStack(err.stack ?? ""),
    "error.type": err.constructor.name,
  })
  return err
}
