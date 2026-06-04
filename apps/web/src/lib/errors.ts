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

/**
 * Zod issue structure (subset of ZodIssue)
 */
interface ZodIssue {
  readonly path: readonly (string | number)[]
  readonly message: string
}

/**
 * Extract field-level errors from a Zod validation error.
 * Returns a map of field path -> error messages.
 *
 * Handles the nested format from TanStack Start:
 * Error.message = '{"message": "[{...zod issues...}]"}'
 */
export function extractFieldErrors(err: unknown): Record<string, string[]> | null {
  const raw = err instanceof Error ? err.message : String(err)
  try {
    let issues: ZodIssue[] | null = null

    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      issues = parsed
    } else if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      const inner = JSON.parse(parsed.message)
      if (Array.isArray(inner)) {
        issues = inner
      }
    }

    if (issues) {
      const fieldErrors: Record<string, string[]> = {}
      for (const issue of issues) {
        const path = issue.path.join(".")
        if (!fieldErrors[path]) {
          fieldErrors[path] = []
        }
        fieldErrors[path].push(issue.message)
      }
      return Object.keys(fieldErrors).length > 0 ? fieldErrors : null
    }
  } catch {
    // not JSON or not Zod format
  }
  return null
}
