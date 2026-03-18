import type { QueuePublishError } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
import { type OrganizationId, type ProjectId, putInDisk, StorageDisk, type StorageError } from "@domain/shared"
import { Effect } from "effect"

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
    const disk = yield* StorageDisk
    const publisher = yield* QueuePublisher

    const fileKey = yield* putInDisk(disk, {
      namespace: "ingest",
      organizationId: input.organizationId,
      projectId: input.projectId,
      content: input.payload,
      extension: input.contentType.includes("protobuf") ? "protobuf" : "json",
    })

    yield* publisher.publish("span-ingestion", {
      body: new TextEncoder().encode(fileKey),
      key: input.organizationId,
      headers: new Map([
        ["content-type", input.contentType],
        ["organization-id", input.organizationId],
        ["project-id", input.projectId],
        ["api-key-id", input.apiKeyId],
        ["ingested-at", new Date().toISOString()],
      ]),
    })
  })
