import type { Span } from "@opentelemetry/api"

const toError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)))

/**
 * Strip `file://` protocol from stack traces so Datadog can match frames
 * against uploaded sourcemaps (which use bare `/app/...` path prefixes).
 * Datadog only uses `.js.map` files to unminify stack traces, so apps/web also
 * rewrites its Nitro/Vinxi server bundle frames from `.mjs` to `.js` to match
 * the upload-time aliases created during the build.
 */
const normalizeStack = (stack: string): string =>
  stack.replaceAll("file://", "").replaceAll(/(\/app\/apps\/web\/\.output\/server\/[^\s):]+)\.mjs(?=[:)])/g, "$1.js")

export function recordSpanExceptionForDatadog(span: Span, error: unknown): Error {
  const err = toError(error)
  const stack = normalizeStack(err.stack ?? "")
  err.stack = stack

  span.recordException({ name: err.name, message: err.message, stack })
  span.setAttributes({
    "error.message": err.message,
    "error.stack": stack,
    "error.type": err.constructor.name,
  })
  return err
}
