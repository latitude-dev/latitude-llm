import { ProjectRepository } from "@domain/projects"
import type { QueuePublishError } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
import {
  type OrganizationId,
  ProjectId,
  putInDisk,
  type RepositoryError,
  type SqlClient,
  StorageDisk,
  type StorageError,
} from "@domain/shared"
import { base64Encode } from "@repo/utils"
import { Effect } from "effect"
import { SpanDecodingError } from "../errors.ts"
import { decodeOtlpProtobuf } from "../otlp/proto.ts"
import { resolveSpanProjectSlug } from "../otlp/transform.ts"
import type { OtlpExportTraceServiceRequest } from "../otlp/types.ts"

const INLINE_PAYLOAD_MAX_BYTES = 50_000 // 50 KB

export interface IngestSpansInput {
  readonly organizationId: OrganizationId
  readonly apiKeyId: string
  readonly payload: Uint8Array
  readonly contentType: string
  /**
   * Project slug from the `X-Latitude-Project` header. Used as the fallback for spans that
   * carry no `latitude.project` attribute on the span or its OTEL resource. Optional — when
   * absent, spans without a per-span / resource attribute are rejected.
   */
  readonly defaultProjectSlug?: string
}

/**
 * Per-batch outcome of project resolution. Drives the OTLP `partial_success` response shape
 * at the HTTP boundary.
 */
export interface IngestSpansResult {
  readonly totalSpans: number
  readonly acceptedSpans: number
  readonly rejectedSpans: number
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

interface PayloadInspection {
  readonly totalSpans: number
  readonly spanSlugs: readonly (string | undefined)[]
  readonly uniqueSlugs: ReadonlySet<string>
}

function inspectPayload(request: OtlpExportTraceServiceRequest): PayloadInspection {
  const uniqueSlugs = new Set<string>()
  const spanSlugs: (string | undefined)[] = []
  let totalSpans = 0

  for (const resourceSpans of request.resourceSpans ?? []) {
    const resourceAttrs = resourceSpans.resource?.attributes ?? []
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      for (const span of scopeSpans.spans ?? []) {
        totalSpans++
        const slug = resolveSpanProjectSlug(span.attributes ?? [], resourceAttrs)
        spanSlugs.push(slug)
        if (slug) uniqueSlugs.add(slug)
      }
    }
  }

  return { totalSpans, spanSlugs, uniqueSlugs }
}

const resolveSlug = (slug: string): Effect.Effect<string | null, RepositoryError, ProjectRepository | SqlClient> =>
  Effect.gen(function* () {
    const repo = yield* ProjectRepository
    return yield* repo.findBySlug(slug).pipe(
      Effect.map((project) => project.id as string),
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
    )
  })

export const ingestSpansUseCase = (
  input: IngestSpansInput,
): Effect.Effect<
  IngestSpansResult,
  StorageError | QueuePublishError | RepositoryError | SpanDecodingError,
  StorageDisk | QueuePublisher | ProjectRepository | SqlClient
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

    const decoded = decodeRequest(input.payload, input.contentType)
    if (!decoded) {
      return yield* new SpanDecodingError({ reason: "failed to decode OTLP message" })
    }

    const { totalSpans, spanSlugs, uniqueSlugs } = inspectPayload(decoded)
    if (totalSpans === 0) {
      return { totalSpans: 0, acceptedSpans: 0, rejectedSpans: 0 }
    }

    // Resolve every unique slug (including the header default) against the org. One DB call per
    // unique slug; the request handler treats this map as the source of truth.
    const slugsToResolve = new Set<string>(uniqueSlugs)
    if (input.defaultProjectSlug) slugsToResolve.add(input.defaultProjectSlug)

    const projectIdBySlug = new Map<string, string>()
    for (const slug of slugsToResolve) {
      const projectId = yield* resolveSlug(slug)
      if (projectId) projectIdBySlug.set(slug, projectId)
    }

    const defaultProjectId = input.defaultProjectSlug ? (projectIdBySlug.get(input.defaultProjectSlug) ?? null) : null

    let acceptedSpans = 0
    let rejectedSpans = 0
    for (const slug of spanSlugs) {
      if (slug) {
        if (projectIdBySlug.has(slug)) acceptedSpans++
        else rejectedSpans++
      } else if (defaultProjectId) {
        acceptedSpans++
      } else {
        rejectedSpans++
      }
    }

    yield* Effect.annotateCurrentSpan("totalSpans", totalSpans)
    yield* Effect.annotateCurrentSpan("acceptedSpans", acceptedSpans)
    yield* Effect.annotateCurrentSpan("rejectedSpans", rejectedSpans)

    if (acceptedSpans === 0) {
      return { totalSpans, acceptedSpans: 0, rejectedSpans }
    }

    const publisher = yield* QueuePublisher

    // Storage path needs *a* projectId for the existing `tmp-ingest/{org}/{project}/{id}` layout
    // — the actual per-span routing is done downstream from `projectIdBySlug` + `defaultProjectId`,
    // not from this key. Pick anything resolvable so the path stays predictable.
    const storageProjectId =
      defaultProjectId ?? (projectIdBySlug.size > 0 ? (projectIdBySlug.values().next().value as string) : null)

    let fileKey: string | null = null
    let inlinePayload: string | null = null
    if (input.payload.byteLength <= INLINE_PAYLOAD_MAX_BYTES) {
      inlinePayload = base64Encode(input.payload)
    } else {
      if (!storageProjectId) {
        // Unreachable given `acceptedSpans > 0` guarantees at least one resolved projectId,
        // but keeps the type-narrowing honest.
        return { totalSpans, acceptedSpans: 0, rejectedSpans: totalSpans }
      }
      const disk = yield* StorageDisk
      fileKey = yield* putInDisk(disk, {
        namespace: "ingest",
        organizationId: input.organizationId,
        projectId: ProjectId(storageProjectId),
        content: input.payload,
        extension: input.contentType.includes("protobuf") ? "protobuf" : "json",
      })
    }

    yield* publisher.publish("span-ingestion", "ingest", {
      fileKey,
      inlinePayload,
      contentType: input.contentType,
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      ingestedAt: new Date().toISOString(),
      defaultProjectId,
      projectIdBySlug: Object.fromEntries(projectIdBySlug),
    })

    return { totalSpans, acceptedSpans, rejectedSpans }
  }).pipe(Effect.withSpan("spans.ingestSpans"))
