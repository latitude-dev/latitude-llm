/**
 * Client-side helpers for decoding errors thrown by server functions.
 *
 * The server-side `errorHandler` middleware (in `server/middlewares.ts`)
 * JSON-encodes `{ _tag, message, status }` into `error.message` because
 * TanStack Start only serializes that single field across the boundary.
 * These helpers decode that payload back into structured data.
 */

/**
 * Structured error returned by `parseServerError`.
 */
interface ServerError {
  readonly _tag: string | undefined
  readonly message: string
  readonly status: number
}

/**
 * Parse an error thrown by a server function on the client.
 *
 * Returns `{ _tag, message, status }` when the error was produced by
 * `errorHandler`, otherwise falls back to the raw error message with no tag.
 */
export function parseServerError(err: unknown): ServerError {
  const raw = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      return {
        _tag: parsed._tag,
        message: parsed.message,
        status: typeof parsed.status === "number" ? parsed.status : 500,
      }
    }
  } catch {
    // not JSON — fall through
  }
  return { _tag: undefined, message: raw, status: 500 }
}

/**
 * Extract a user-friendly error message from a server function error.
 *
 * Use this in UI catch blocks where you just need the message string
 * (e.g. for toast notifications or inline error displays).
 */
export function toUserMessage(err: unknown): string {
  return parseServerError(err).message
}
