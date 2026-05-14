import type { DomainEvent, EventsPublisher } from "@domain/events"
import {
  type ChSqlClient,
  getFromDisk,
  type OrganizationId,
  ProjectId,
  type RepositoryError,
  StorageDisk,
  type StorageError,
} from "@domain/shared"
import { Effect } from "effect"
import type { SpanDetail } from "../entities/span.ts"
import { SpanDecodingError } from "../errors.ts"
import { decodeOtlpProtobuf } from "../otlp/proto.ts"
import { transformOtlpToSpans } from "../otlp/transform.ts"
import type { OtlpExportTraceServiceRequest } from "../otlp/types.ts"
import { SpanRepository } from "../ports/span-repository.ts"

const VERCEL_WRAPPER_OPERATION_IDS = new Set([
  "ai.generateText",
  "ai.streamText",
  "ai.generateObject",
  "ai.streamObject",
])

function isVercelWrapperSpan(span: SpanDetail): boolean {
  const operationId = span.attrString["ai.operationId"]
  if (operationId && VERCEL_WRAPPER_OPERATION_IDS.has(operationId)) {
    return true
  }

  return VERCEL_WRAPPER_OPERATION_IDS.has(span.name)
}

function sanitizeVercelWrapperSpan(span: SpanDetail): SpanDetail {
  const next: SpanDetail = {
    ...span,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
  }

  if (!span.costIsEstimated) return next

  return {
    ...next,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    costIsEstimated: false,
  }
}

function sanitizePersistedSpans(spans: readonly SpanDetail[]): readonly SpanDetail[] {
  if (!spans.some((span) => span.name.startsWith("ai.") || span.attrString["ai.operationId"] !== undefined)) {
    return spans
  }

  return spans.map((span) => (isVercelWrapperSpan(span) ? sanitizeVercelWrapperSpan(span) : span))
}

export interface ProcessIngestedSpansInput {
  readonly organizationId: OrganizationId
  readonly apiKeyId: string
  readonly contentType: string
  readonly ingestedAt: Date
  readonly retentionDays?: number
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

  return Effect.fail(new SpanDecodingError({ reason: "no inline payload or fileKey in message" }))
}

function decodeAndTransform(
  payload: Uint8Array,
  input: ProcessIngestedSpansInput,
): Effect.Effect<readonly SpanDetail[], SpanDecodingError> {
  return Effect.gen(function* () {
    const request = decodeRequest(payload, input.contentType)
    if (!request) {
      return yield* new SpanDecodingError({ reason: "failed to decode OTLP message" })
    }

    if (!request.resourceSpans?.length) {
      return []
    }

    const { spans } = transformOtlpToSpans(request, {
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      ingestedAt: input.ingestedAt,
      defaultProjectId: input.defaultProjectId,
      projectIdBySlug: new Map(Object.entries(input.projectIdBySlug)),
    })

    return sanitizePersistedSpans(spans)
  })
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
    SpanDecodingError | StorageError | RepositoryError | TPublishError,
    ChSqlClient | SpanRepository | StorageDisk
  > =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

      const payload = yield* resolvePayload(input)
      const spans = yield* decodeAndTransform(payload, input)
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
