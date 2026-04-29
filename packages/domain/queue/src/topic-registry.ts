import type { DomainEvent } from "@domain/events"

/**
 * Phantom type helper: returns an empty object at runtime but carries type T
 * at compile time. This lets us define the registry as a single const object
 * from which both TopicRegistry (the type) and TOPIC_NAMES (runtime) are derived.
 */
function payloads<T extends Record<string, unknown>>(): T {
  return {} as T
}

const _registry = {
  "domain-events": payloads<{
    dispatch: {
      readonly id: string
      readonly event: DomainEvent
      readonly occurredAt: string
    }
  }>(),

  "magic-link-email": payloads<{
    send: {
      readonly email: string
      readonly magicLinkUrl: string
      readonly organizationId: string
    }
  }>(),

  "invitation-email": payloads<{
    send: {
      readonly email: string
      readonly invitationUrl: string
      readonly organizationId: string
      readonly organizationName: string
      readonly inviterName: string
    }
  }>(),

  "user-deletion": payloads<{
    delete: {
      readonly organizationId: string
      readonly userId: string
    }
  }>(),

  "span-ingestion": payloads<{
    ingest: {
      readonly fileKey: string | null
      readonly inlinePayload: string | null
      readonly contentType: string
      readonly organizationId: string
      readonly projectId: string
      readonly apiKeyId: string
      readonly ingestedAt: string
    }
  }>(),

  exports: payloads<{
    generate: {
      readonly kind: "dataset" | "traces" | "issues"
      readonly organizationId: string
      readonly projectId: string
      readonly recipientEmail: string
      // Shared selection fields
      readonly selection?:
        | { readonly mode: "selected"; readonly rowIds: readonly string[] }
        | { readonly mode: "all" }
        | { readonly mode: "allExcept"; readonly rowIds: readonly string[] }
      // Dataset-specific fields
      readonly datasetId?: string
      // Traces-specific fields - uses FilterSet shape
      readonly filters?: Readonly<Record<string, readonly { readonly op: string; readonly value: unknown }[]>>
      // Issues-specific fields
      readonly lifecycleGroup?: "active" | "archived"
      readonly searchQuery?: string
      readonly timeRange?: {
        readonly fromIso?: string
        readonly toIso?: string
      }
      readonly sort?: {
        readonly field: "lastSeen" | "occurrences" | "state"
        readonly direction: "asc" | "desc"
      }
    }
  }>(),

  issues: payloads<{
    discovery: {
      readonly organizationId: string
      readonly projectId: string
      readonly scoreId: string
      readonly issueId: string | null
    }
    refresh: {
      readonly organizationId: string
      readonly projectId: string
      readonly issueId: string
    }
    removeScore: {
      readonly organizationId: string
      readonly projectId: string
      readonly scoreId: string
      readonly issueId: string | null
      readonly draftedAt: string | null
      readonly feedback: string
      readonly source: string
      readonly createdAt: string
    }
  }>(),

  evaluations: payloads<{
    automaticRefreshAlignment: {
      readonly organizationId: string
      readonly projectId: string
      readonly issueId: string
      readonly evaluationId: string
    }
    automaticOptimization: {
      readonly organizationId: string
      readonly projectId: string
      readonly issueId: string
      readonly evaluationId: string
    }
  }>(),

  "annotation-scores": payloads<{
    publishHumanAnnotation: {
      readonly organizationId: string
      readonly projectId: string
      readonly scoreId: string
    }
    markReviewStarted: {
      readonly organizationId: string
      readonly projectId: string
      readonly scoreId: string
    }
  }>(),

  scores: payloads<{
    "delete-analytics": {
      readonly organizationId: string
      readonly scoreId: string
    }
  }>(),

  "live-evaluations": payloads<{
    execute: {
      readonly organizationId: string
      readonly projectId: string
      readonly evaluationId: string
      readonly traceId: string
    }
  }>(),

  "trace-end": payloads<{
    run: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
  }>(),

  // Runs the deterministic portion of every registered flagger strategy against
  // a trace. Matched strategies write a SYSTEM-authored score directly; strategies
  // that return `no-match` are sampled and, if selected, routed to the LLM
  // workflow; `ambiguous` strategies are rate-limited per {org, slug} and also
  // routed to the LLM workflow. Per-strategy failures are isolated.
  "deterministic-flaggers": payloads<{
    run: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
  }>(),

  // Thin start-workflow job. Separates the Temporal `start()` call out of the
  // deterministic-flaggers hot path so transient Temporal unavailability retries
  // with bounded BullMQ backoff instead of re-running the whole deterministic fan-out.
  "start-flagger-workflow": payloads<{
    start: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
      readonly flaggerId: string
      readonly flaggerSlug: string
      readonly reason: "sampled" | "ambiguous"
    }
  }>(),

  projects: payloads<{
    provision: {
      readonly organizationId: string
      readonly projectId: string
      readonly name: string
      readonly slug: string
    }
    checkFirstTrace: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
  }>(),

  "api-keys": payloads<{
    create: {
      readonly organizationId: string
      readonly name: string
    }
  }>(),

  "annotation-queues": payloads<{
    bulkImport: {
      readonly organizationId: string
      readonly projectId: string
      readonly queueId: string
      readonly selection:
        | { readonly mode: "selected"; readonly traceIds: readonly string[] }
        | { readonly mode: "all"; readonly filters?: Record<string, unknown> }
        | {
            readonly mode: "allExcept"
            readonly traceIds: readonly string[]
            readonly filters?: Record<string, unknown>
          }
    }
  }>(),

  "posthog-analytics": payloads<{
    track: {
      readonly eventName: string
      readonly organizationId: string
      readonly payload: Record<string, unknown>
      readonly occurredAt: string
    }
  }>(),

  "trace-search": payloads<{
    refreshTrace: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
      readonly startTime: string
      readonly rootSpanName: string
    }
  }>(),

  // Writes annotations into the Latitude-owned dogfood project via
  // @platform/latitude-api. The worker is fire-and-forget from the reviewer's
  // perspective — the web route 202s immediately on enqueue, and BullMQ's
  // retry policy drives redelivery on transient failures.
  "product-feedback": payloads<{
    submitSystemAnnotatorReview: {
      readonly upstreamScoreId: string
      // Discriminated at the type level: reject requires a comment, approve does
      // not. Mirrors the Phase 5 UI's disabled-submit behaviour on reject.
      readonly review:
        | { readonly decision: "approve"; readonly comment?: string }
        | { readonly decision: "reject"; readonly comment: string }
    }
    submitEnrichmentReview: {
      readonly upstreamScoreId: string
      readonly review:
        | { readonly decision: "good"; readonly comment?: string }
        | { readonly decision: "bad"; readonly comment: string }
    }
  }>(),
}

export type TopicRegistry = typeof _registry
export const TOPIC_NAMES = Object.keys(_registry) as (keyof TopicRegistry & string)[]
