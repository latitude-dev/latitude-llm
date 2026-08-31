import type { OrganizationId } from "@domain/shared"
import { createLogger, recordSpanExceptionForDatadog, SpanStatusCode, trace } from "@repo/observability"

const logger = createLogger("stale-subscription-period")
const tracer = trace.getTracer("stale-subscription-period")

// Message must stay constant: Datadog fingerprints Error Tracking issues on error type and stack.
class StaleSubscriptionPeriodError extends Error {
  constructor() {
    super("Mirrored Stripe subscription billing period is past end")
    this.name = "StaleSubscriptionPeriodError"
  }
}

const REPORT_INTERVAL_MS = 60 * 60 * 1000

export const MAX_TRACKED_SUBSCRIPTIONS = 500

const lastReportedAt = new Map<string, number>()

function evictToMakeRoom(now: number): void {
  if (lastReportedAt.size < MAX_TRACKED_SUBSCRIPTIONS) return

  for (const [tracked, at] of lastReportedAt) {
    if (now - at >= REPORT_INTERVAL_MS) lastReportedAt.delete(tracked)
  }
  if (lastReportedAt.size >= MAX_TRACKED_SUBSCRIPTIONS) {
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

type StaleSubscriptionPeriodAlert =
  | "stale_subscription_period"
  | "stale_subscription_period_refresh_failed"
  | "stale_subscription_period_refresh_unavailable"

export function reportStaleSubscriptionPeriod(input: {
  readonly organizationId: OrganizationId
  readonly stripeSubscriptionId: string | null
  readonly alert: StaleSubscriptionPeriodAlert
  readonly periodEnd?: Date | null
  readonly errorMessage?: string
}): void {
  const key = `${input.organizationId}:${input.stripeSubscriptionId ?? "missing"}`
  if (!claimReportSlot(key, Date.now())) return

  logger.error("Mirrored Stripe subscription billing period is past end", {
    organizationId: input.organizationId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    alert: input.alert,
    periodEnd: input.periodEnd?.toISOString() ?? null,
    errorMessage: input.errorMessage,
  })

  const span = tracer.startSpan("billing.stale_subscription_period")
  span.setAttributes({
    "latitude.organization_id": input.organizationId,
    "billing.alert": input.alert,
    ...(input.stripeSubscriptionId ? { "billing.stripe_subscription_id": input.stripeSubscriptionId } : {}),
    ...(input.periodEnd ? { "billing.period_end": input.periodEnd.toISOString() } : {}),
    ...(input.errorMessage ? { "error.message": input.errorMessage } : {}),
  })
  const error = new StaleSubscriptionPeriodError()
  recordSpanExceptionForDatadog(span, error)
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
  span.end()
}

export function resetStaleSubscriptionPeriodReportThrottle(): void {
  lastReportedAt.clear()
}
