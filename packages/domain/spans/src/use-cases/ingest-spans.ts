import type { QueuePublishError } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
import { type OrganizationId, type ProjectId, putInDisk, StorageDisk, type StorageError } from "@domain/shared"
import { Effect } from "effect"

const INLINE_PAYLOAD_MAX_BYTES = 50_000 // 50 KB

/** RFC 4648 base64 for inline queue payloads (web-standard `btoa`, no Node `Buffer`). */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  return globalThis.btoa(binary)
}

export interface IngestSpansInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly apiKeyId: string
  readonly payload: Uint8Array
  readonly contentType: string
}

export const ingestSpansUseCase = (
  input: IngestSpansInput,
): Effect.Effect<void, StorageError | QueuePublishError, StorageDisk | QueuePublisher> =>
  Effect.gen(function* () {
    const publisher = yield* QueuePublisher

    let fileKey: string | null = null
    let inlinePayload: string | null = null

    if (input.payload.byteLength <= INLINE_PAYLOAD_MAX_BYTES) {
      inlinePayload = uint8ArrayToBase64(input.payload)
    } else {
      const disk = yield* StorageDisk
      fileKey = yield* putInDisk(disk, {
        namespace: "ingest",
        organizationId: input.organizationId,
        projectId: input.projectId,
        content: input.payload,
        extension: input.contentType.includes("protobuf") ? "protobuf" : "json",
      })
    }

    yield* publisher.publish("span-ingestion", "ingest", {
      fileKey,
      inlinePayload,
      contentType: input.contentType,
      organizationId: input.organizationId,
      projectId: input.projectId,
      apiKeyId: input.apiKeyId,
      ingestedAt: new Date().toISOString(),
    })
  })
