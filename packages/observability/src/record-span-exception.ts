import type { Span } from "@opentelemetry/api"

const safeStringify = (value: object): string => {
  try {
    const json = JSON.stringify(value)
    if (json && json !== "{}") return json
  } catch {
    // circular or otherwise non-serializable — fall through to String()
  }
  return String(value)
}

// A thrown non-Error (e.g. a transport rejecting with `{ statusCode, response }`)
// would otherwise stringify to the useless "[object Object]", erasing the real
// cause before it reaches Datadog. Prefer the object's own `message`, then a
// JSON dump, and carry its `name` so grouping survives.
const toError = (value: unknown): Error => {
  if (value instanceof Error) return value
  if (value === null || typeof value !== "object") return new Error(String(value))

  const record = value as { message?: unknown; name?: unknown }
  const message =
    typeof record.message === "string" && record.message.length > 0 ? record.message : safeStringify(value)
  const error = new Error(message)
  if (typeof record.name === "string" && record.name.length > 0) error.name = record.name
  return error
}

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

  span.recordException({ name: err.name, message: err.message, stack })
  span.setAttributes({
    "error.message": err.message,
    "error.stack": stack,
    "error.type": err.constructor.name,
  })
  return err
}
