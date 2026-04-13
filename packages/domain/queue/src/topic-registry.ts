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
      readonly emailFlow: string | null
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
  }>(),

  evaluations: payloads<{
    align: {
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
  }>(),

  "live-evaluations": payloads<{
    enqueue: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
    execute: {
      readonly organizationId: string
      readonly projectId: string
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
    fanOut: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
  }>(),

  projects: payloads<{
    provision: {
      readonly organizationId: string
      readonly projectId: string
      readonly name: string
      readonly slug: string
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
}

export type TopicRegistry = typeof _registry
export const TOPIC_NAMES = Object.keys(_registry) as (keyof TopicRegistry & string)[]
