import type { DomainEvent, EventsPublisher } from "@domain/events"
import {
  getFromDisk,
  type OrganizationId,
  type ProjectId,
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
  readonly projectId: ProjectId
  readonly apiKeyId: string
  readonly contentType: string
  readonly ingestedAt: Date
  readonly inlinePayload: string | null
  readonly fileKey: string | null
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

    return sanitizePersistedSpans(
      transformOtlpToSpans(request, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        apiKeyId: input.apiKeyId,
        ingestedAt: input.ingestedAt,
      }),
    )
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
    SpanRepository | StorageDisk
  > =>
    Effect.gen(function* () {
      const payload = yield* resolvePayload(input)
      const spans = yield* decodeAndTransform(payload, input)

      if (spans.length === 0) {
        return
      }

      const repo = yield* SpanRepository
      yield* repo.insert(spans)

      const traceIds = new Set(spans.map((s) => s.traceId))
      yield* Effect.all(
        [...traceIds].map((traceId) =>
          eventsPublisher.publish({
            name: "SpanIngested",
            organizationId: input.organizationId,
            payload: { organizationId: input.organizationId, projectId: input.projectId, traceId },
          } satisfies DomainEvent),
        ),
        { concurrency: "unbounded" },
      )
    })
