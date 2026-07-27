import type { DomainEvent, EventsPublisher } from "@domain/events"
import {
  type ChSqlClient,
  deleteFromDisk,
  deserializeRedactionPolicy,
  getFromDisk,
  type OrganizationId,
  ProjectId,
  type RedactionPolicy,
  type RepositoryError,
  type SerializedRedactionPolicy,
  StorageDisk,
  type StorageError,
} from "@domain/shared"
import { Effect } from "effect"
import type { SpanDetail } from "../entities/span.ts"
import { RedactionError, SpanDecodingError } from "../errors.ts"
import { decodeOtlpProtobuf } from "../otlp/proto.ts"
import { transformOtlpToSpans } from "../otlp/transform.ts"
import type { OtlpExportTraceServiceRequest } from "../otlp/types.ts"
import { SpanRepository } from "../ports/span-repository.ts"
import { redactSpans, type SpanRedactionSummary } from "../redaction/redact-spans.ts"
import { totalRedactionCount } from "../redaction/redact-text.ts"

export interface ProcessIngestedSpansInput {
  readonly organizationId: OrganizationId
  readonly apiKeyId: string
  readonly contentType: string
  readonly ingestedAt: Date
  readonly isSandbox?: boolean
  readonly retentionDays?: number
  /**
   * Per-project redaction policy stamped at the ingest boundary. Absent, or absent
   * for a given project, means that project opted out.
   */
  readonly redaction?: Readonly<Record<string, SerializedRedactionPolicy>>
  /** Absent degrades pseudonymized identities to full redaction rather than blocking ingestion. */
  readonly pseudonymSecret?: string
  readonly traceUsage?: {
    readonly context?: {
      readonly planSlug: "free" | "pro" | "enterprise"
      readonly planSource: "override" | "subscription" | "free-fallback"
      readonly periodStart: Date
      readonly periodEnd: Date
      readonly includedCredits: number
      readonly overageAllowed: boolean
    }
  }
  readonly inlinePayload: string | null
  readonly fileKey: string | null
  /**
   * Resolved by the request handler from the `X-Latitude-Project` header. Used for spans that
   * carry no `latitude.project` attribute on the span or its OTEL resource.
   */
  readonly defaultProjectId: string | null
  /**
   * Slug → projectId map pre-resolved by the request handler. Spans whose slug isn't in this
   * map (and have no default) are dropped here; the request handler has already accounted
   * for them in the OTLP `partial_success` response.
   */
  readonly projectIdBySlug: Readonly<Record<string, string>>
}

function decodeRequest(value: Uint8Array, contentType: string): OtlpExportTraceServiceRequest | null {
  try {
    if (contentType.includes("application/x-protobuf")) {
      return decodeOtlpProtobuf(value)
    }
    return JSON.parse(new TextDecoder().decode(value)) as OtlpExportTraceServiceRequest
  } catch {
    return null
  }
}

function resolvePayload(
  input: ProcessIngestedSpansInput,
): Effect.Effect<Uint8Array, SpanDecodingError | StorageError, StorageDisk> {
  if (input.inlinePayload) {
    return Effect.succeed(Uint8Array.from(atob(input.inlinePayload), (c) => c.charCodeAt(0)))
  }

  if (input.fileKey) {
    const fileKey = input.fileKey
    return Effect.gen(function* () {
      const disk = yield* StorageDisk
      return yield* getFromDisk(disk, fileKey)
    })
  }

  return Effect.fail(
    new SpanDecodingError({
      reason: "no inline payload or fileKey in message",
    }),
  )
}

function decodeAndTransform(
  payload: Uint8Array,
  input: ProcessIngestedSpansInput,
): Effect.Effect<readonly SpanDetail[], SpanDecodingError> {
  return Effect.gen(function* () {
    const request = decodeRequest(payload, input.contentType)
    if (!request) {
      return yield* new SpanDecodingError({
        reason: "failed to decode OTLP message",
      })
    }

    if (!request.resourceSpans?.length) {
      return []
    }

    const { spans, rejectedSpans } = transformOtlpToSpans(request, {
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      ingestedAt: input.ingestedAt,
      defaultProjectId: input.defaultProjectId,
      projectIdBySlug: new Map(Object.entries(input.projectIdBySlug)),
    })

    if (rejectedSpans > 0) {
      yield* Effect.annotateCurrentSpan("rejectedSpans", rejectedSpans)
    }

    return spans
  })
}

/**
 * Redaction is destructive and non-retroactive, so these counts are the only way to
 * answer "is it working" or "why did my content disappear" after the fact.
 */
function annotateRedaction(summary: SpanRedactionSummary): Effect.Effect<void> {
  if (summary.redactedSpans === 0) return Effect.void

  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("redaction.spans", summary.redactedSpans)
    yield* Effect.annotateCurrentSpan("redaction.leavesScanned", summary.leavesScanned)
    yield* Effect.annotateCurrentSpan("redaction.charsScanned", summary.charsScanned)
    yield* Effect.annotateCurrentSpan("redaction.matches", totalRedactionCount(summary.counts))
    yield* Effect.annotateCurrentSpan("redaction.droppedAttributeKeys", summary.droppedAttributeKeys)

    for (const [entity, count] of Object.entries(summary.counts)) {
      yield* Effect.annotateCurrentSpan(`redaction.matches.${entity}`, count)
    }

    if (summary.oversizedFields > 0) {
      yield* Effect.annotateCurrentSpan("redaction.oversizedFields", summary.oversizedFields)
      yield* Effect.logWarning("Redaction replaced oversized fields wholesale", {
        oversizedFields: summary.oversizedFields,
      })
    }

    if (summary.pseudonymizedIdentities > 0) {
      yield* Effect.annotateCurrentSpan("redaction.pseudonymizedIdentities", summary.pseudonymizedIdentities)
    }

    if (summary.identityFallback) {
      yield* Effect.annotateCurrentSpan("redaction.identityFallback", true)
      yield* Effect.logError("Redaction fell back to redacting identities: no pseudonym secret is configured")
    }
  })
}

/**
 * A present but malformed policy fails the job rather than being skipped. Skipping
 * would resolve a corrupt policy on a project that opted in to a plaintext write,
 * which is the one outcome redaction exists to prevent. An absent field is
 * different and legitimate: it means no project opted in.
 */
function decodeRedactionPolicies(
  wire: Readonly<Record<string, SerializedRedactionPolicy>> | undefined,
): Effect.Effect<ReadonlyMap<string, RedactionPolicy>, RedactionError> {
  if (!wire) return Effect.succeed(new Map())

  const policies = new Map<string, RedactionPolicy>()
  for (const [projectId, serialized] of Object.entries(wire)) {
    const policy = deserializeRedactionPolicy(serialized)
    if (!policy) {
      return Effect.fail(new RedactionError({ reason: `malformed redaction policy for project ${projectId}` }))
    }
    policies.set(projectId, policy)
  }

  return Effect.succeed(policies)
}

export interface ProcessIngestedSpansDeps<TPublishError = unknown> {
  readonly eventsPublisher: EventsPublisher<TPublishError>
}

export const processIngestedSpansUseCase =
  <TPublishError>({ eventsPublisher }: ProcessIngestedSpansDeps<TPublishError>) =>
  (
    input: ProcessIngestedSpansInput,
  ): Effect.Effect<
    void,
    SpanDecodingError | StorageError | RepositoryError | RedactionError | TPublishError,
    ChSqlClient | SpanRepository | StorageDisk
  > =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

      const payload = yield* resolvePayload(input)
      const transformed = yield* decodeAndTransform(payload, input)

      // Redaction runs before the retention stamp and the insert, which makes it the
      // single choke point for every content sink: `traces` and `sessions` are
      // materialized views on `spans`, every other derived table re-reads `spans`,
      // and `TracesIngested` has not fired yet.
      const policyByProjectId = yield* decodeRedactionPolicies(input.redaction)
      const redaction = yield* redactSpans({
        spans: transformed,
        organizationId: input.organizationId,
        policyByProjectId,
        pseudonymSecret: input.pseudonymSecret,
      })
      yield* annotateRedaction(redaction.summary)

      const spans = redaction.spans
      const persistedSpans =
        input.retentionDays === undefined
          ? spans
          : spans.map((span) => ({
              ...span,
              retentionDays: input.retentionDays,
            }))

      if (persistedSpans.length === 0) {
        return
      }

      const repo = yield* SpanRepository
      yield* repo.insert(persistedSpans)

      // The buffered payload holds unredacted content. It is dropped as soon as the
      // spans are durable, so the object-store lifecycle rule is a backstop rather
      // than the only bound — self-hosted disk backends have no lifecycle rule at
      // all. A failed delete must not fail an already-successful ingest.
      if (input.fileKey) {
        const disk = yield* StorageDisk
        yield* Effect.ignore(deleteFromDisk(disk, input.fileKey))
      }

      // Spans in a single OTLP batch may now belong to different projects (per-span scoping).
      // Group by projectId so each TracesIngested event addresses one project at a time —
      // downstream consumers (issues discovery, billing, flaggers, etc.) are project-scoped.
      const traceIdsByProject = new Map<string, Set<string>>()
      for (const span of persistedSpans) {
        const projectKey = span.projectId as string
        let set = traceIdsByProject.get(projectKey)
        if (!set) {
          set = new Set<string>()
          traceIdsByProject.set(projectKey, set)
        }
        set.add(span.traceId as string)
      }

      for (const [projectIdRaw, traceIdSet] of traceIdsByProject) {
        yield* eventsPublisher.publish({
          name: "TracesIngested",
          organizationId: input.organizationId,
          payload: {
            organizationId: input.organizationId,
            projectId: ProjectId(projectIdRaw),
            traceIds: [...traceIdSet],
            isSandbox: input.isSandbox === true,
            ...(input.traceUsage?.context
              ? {
                  billing: {
                    planSlug: input.traceUsage.context.planSlug,
                    planSource: input.traceUsage.context.planSource,
                    periodStart: input.traceUsage.context.periodStart.toISOString(),
                    periodEnd: input.traceUsage.context.periodEnd.toISOString(),
                    includedCredits: input.traceUsage.context.includedCredits,
                    overageAllowed: input.traceUsage.context.overageAllowed,
                  },
                }
              : {}),
          },
        } satisfies DomainEvent)
      }
    }).pipe(Effect.withSpan("spans.processIngestedSpans"))
