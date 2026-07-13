import { createLogger, serializeError } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("workflows-evaluation-activities")

const MAX_CAUSE_DEPTH = 5

// Temporal's failure converter only serializes `error.message`, so activities
// fold the cause chain into the wrapper's message or the real reason is lost.
export const describeActivityCause = (cause: unknown, depth = 0): string => {
  if (depth >= MAX_CAUSE_DEPTH) {
    return "…"
  }

  if (cause instanceof Error) {
    const message = cause.message?.trim()
    const nested =
      "cause" in cause && cause.cause !== undefined
        ? describeActivityCause((cause as { readonly cause: unknown }).cause, depth + 1)
        : undefined

    if (message) {
      return nested && !message.includes(nested) ? `${message}: ${nested}` : message
    }
    return nested ?? (cause.name && cause.name !== "Error" ? cause.name : "Unknown error")
  }

  if (typeof cause === "object" && cause !== null) {
    const record = cause as Record<string, unknown>
    for (const key of ["message", "httpMessage", "_tag", "name"] as const) {
      const candidate = record[key]
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }
    if ("cause" in record) {
      return describeActivityCause(record.cause, depth + 1)
    }
  }

  return cause === undefined ? "Unknown error" : String(cause)
}

export const logActivityFailure = (activity: string, cause: unknown): Effect.Effect<void> =>
  Effect.sync(() =>
    logger.error(`Evaluation activity "${activity}" failed`, {
      activity,
      reason: describeActivityCause(cause),
      error: serializeError(cause),
    }),
  )
