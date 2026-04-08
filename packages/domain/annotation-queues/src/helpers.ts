import type { TraceDetail } from "@domain/spans"
import type { AnnotationQueueItemStatus } from "./entities/annotation-queue-items.ts"

const TOOL_RESULT_ERROR_TEXT = /(^error\b|error:\s*|\bfailed\b|\bfailure\b|\bexception\b|\btimeout\b|\bunavailable\b)/i
const TOOL_RESULT_ERROR_STATUSES = new Set(["error", "failed", "failure"])

function coalesceInstant(v: Date | string | null | undefined): Date | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Matches the Tool Call Errors system queue without any LLM classification. */
export function matchesToolCallErrorsSystemQueue(trace: Pick<TraceDetail, "allMessages">): boolean {
  const seenToolCallIds = new Set<string>()

  for (const message of trace.allMessages) {
    for (const part of message.parts) {
      if (part.type === "tool_call") {
        const toolCallId = typeof part.id === "string" ? part.id.trim() : ""
        const toolName = typeof part.name === "string" ? part.name.trim() : ""

        if (!toolCallId || !toolName || seenToolCallIds.has(toolCallId)) {
          return true
        }

        seenToolCallIds.add(toolCallId)
        continue
      }

      if (part.type !== "tool_call_response") continue

      const toolCallId = typeof part.id === "string" ? part.id.trim() : ""
      if (!toolCallId || !seenToolCallIds.has(toolCallId)) {
        return true
      }

      if (responseIndicatesFailure(part.response)) {
        return true
      }
    }
  }

  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function responseIndicatesFailure(response: unknown): boolean {
  if (typeof response === "string") {
    const trimmed = response.trim()
    if (trimmed === "") return false

    try {
      return responseIndicatesFailure(JSON.parse(trimmed))
    } catch {
      return TOOL_RESULT_ERROR_TEXT.test(trimmed)
    }
  }

  if (Array.isArray(response)) {
    return response.some(responseIndicatesFailure)
  }

  if (!isRecord(response)) return false

  if (response.isError === true || response.ok === false || response.success === false) {
    return true
  }

  const status = toNonEmptyString(response.status)
  if (status && TOOL_RESULT_ERROR_STATUSES.has(status.toLowerCase())) {
    return true
  }

  if ("error" in response) {
    const error = response.error
    if (error !== null && error !== undefined && error !== false && error !== "") {
      return true
    }
  }

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    return true
  }

  return false
}

/** Accepts entity dates or ISO strings (e.g. from API records). */
export function annotationQueueItemStatus(item: {
  completedAt: Date | string | null | undefined
  reviewStartedAt: Date | string | null | undefined
}): AnnotationQueueItemStatus {
  if (coalesceInstant(item.completedAt)) return "completed"
  if (coalesceInstant(item.reviewStartedAt)) return "inProgress"
  return "pending"
}

/** Status tier for sorting and keyset cursors: pending (0) → in progress (1) → completed (2). */
type AnnotationQueueItemStatusRank = 0 | 1 | 2
export function annotationQueueItemStatusRankFromTimestamps(
  completedAt: Date | null,
  reviewStartedAt: Date | null,
): AnnotationQueueItemStatusRank {
  if (completedAt) return 2
  if (reviewStartedAt) return 1
  return 0
}
