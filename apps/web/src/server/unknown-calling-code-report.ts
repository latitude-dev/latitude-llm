import { createLogger, recordSpanExceptionForDatadog, SpanStatusCode, trace } from "@repo/observability"

const logger = createLogger("unknown-calling-code")
const tracer = trace.getTracer("unknown-calling-code")

/**
 * Datadog fingerprints Error Tracking issues on error type and stack, so this is thrown from one
 * site with a constant message to keep every occurrence in a single issue. The prefix and length
 * ride on span attributes instead — putting them in the message would split the issue per prefix
 * and bury a genuinely new country code under bot noise.
 */
class UnknownCallingCodeError extends Error {
  constructor() {
    super("Phone number rejected because no known calling code matched its prefix")
    this.name = "UnknownCallingCodeError"
  }
}

const REPORT_INTERVAL_MS = 60 * 60 * 1000

/**
 * Emission is driven by whatever users and bots submit, so one bad prefix hammered repeatedly
 * would otherwise report forever. One report per hour per prefix carries the same information.
 */
export const MAX_TRACKED_PREFIXES = 200

/** Insertion order is kept as least-recently-reported first, so the first key is the eviction target. */
const lastReportedAt = new Map<string, number>()

function evictToMakeRoom(now: number): void {
  if (lastReportedAt.size < MAX_TRACKED_PREFIXES) return

  for (const [tracked, at] of lastReportedAt) {
    if (now - at >= REPORT_INTERVAL_MS) lastReportedAt.delete(tracked)
  }
  // Still full of live claims: drop only the oldest. Clearing the whole map here would lift the
  // throttle off every prefix at once, so a flood of new prefixes could re-open the ones it displaced.
  if (lastReportedAt.size >= MAX_TRACKED_PREFIXES) {
    const oldest = lastReportedAt.keys().next().value
    if (oldest !== undefined) lastReportedAt.delete(oldest)
  }
}

function claimReportSlot(key: string, now: number): boolean {
  const previous = lastReportedAt.get(key)
  if (previous !== undefined && now - previous < REPORT_INTERVAL_MS) return false

  evictToMakeRoom(now)
  lastReportedAt.delete(key)
  lastReportedAt.set(key, now)
  return true
}

const CANDIDATE_PREFIX_LENGTH = 3

/**
 * Only the leading digits and the total length are reported. The number itself is a user's personal
 * phone number, so it must not reach Datadog; three digits plus a length identify nobody while still
 * showing a newly assigned country code as a repeating prefix at a plausible length.
 */
export function reportUnknownCallingCode(phoneNumber: string): void {
  const digits = phoneNumber.replace(/\D/g, "")
  const candidatePrefix = digits.slice(0, CANDIDATE_PREFIX_LENGTH)
  if (candidatePrefix.length === 0) return
  if (!claimReportSlot(candidatePrefix, Date.now())) return

  logger.error("Phone number rejected because no known calling code matched its prefix", {
    candidatePrefix,
    digitCount: digits.length,
  })

  const span = tracer.startSpan("phone.unknown_calling_code")
  span.setAttributes({
    "phone.candidate_prefix": candidatePrefix,
    "phone.digit_count": digits.length,
  })
  const error = new UnknownCallingCodeError()
  recordSpanExceptionForDatadog(span, error)
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
  span.end()
}

/** Exported for tests: the throttle is process-wide state that would otherwise leak across cases. */
export function resetUnknownCallingCodeThrottle(): void {
  lastReportedAt.clear()
}
