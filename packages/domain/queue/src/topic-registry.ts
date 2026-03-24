import type { KnownDomainEvent } from "@domain/events"

// Phantom type helper: returns an empty object at runtime but carries type T
// at compile time. This lets us define the registry as a single const object
// from which both TopicRegistry (the type) and TOPIC_NAMES (runtime) are derived.
function payloads<T extends Record<string, unknown>>(): T {
  return {} as T
}

const _registry = {
  "domain-events": payloads<{
    dispatch: {
      readonly id: string
      readonly event: KnownDomainEvent
      readonly occurredAt: string
    }
  }>(),

  "magic-link-email": payloads<{
    send: {
      readonly email: string
      readonly magicLinkUrl: string
      readonly emailFlow: string | null
      readonly organizationId: string
      readonly organizationName: string
      readonly inviterName: string | null
      readonly invitationId: string | null
    }
  }>(),

  "user-deletion": payloads<{
    delete: { readonly userId: string }
  }>(),

  "span-ingestion": payloads<{
    ingest: {
      readonly fileKey: string
      readonly contentType: string
      readonly organizationId: string
      readonly projectId: string
      readonly apiKeyId: string
      readonly ingestedAt: string
    }
  }>(),

  "dataset-export": payloads<{
    export: {
      readonly datasetId: string
      readonly organizationId: string
      readonly projectId: string
      readonly recipientEmail: string
    }
  }>(),

  "live-traces": payloads<{
    end: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
  }>(),

  issues: payloads<{
    refresh: {
      readonly organizationId: string
      readonly issueId: string
    }
  }>(),

  "annotation-scores": payloads<{
    publish: {
      readonly organizationId: string
      readonly scoreId: string
    }
  }>(),

  "live-evaluations": payloads<{
    enqueue: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
    execute: {
      readonly organizationId: string
      readonly evaluationId: string
      readonly traceId: string
    }
  }>(),

  "live-annotation-queues": payloads<{
    curate: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
  }>(),

  "system-annotation-queues": payloads<{
    flag: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
    annotate: {
      readonly organizationId: string
      readonly queueId: string
      readonly traceId: string
    }
  }>(),
}

export type TopicRegistry = typeof _registry
export const TOPIC_NAMES = Object.keys(_registry) as (keyof TopicRegistry & string)[]
