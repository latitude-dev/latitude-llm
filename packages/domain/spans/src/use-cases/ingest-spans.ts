import type { QueuePublishError } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
import {
  deleteFromDisk,
  type OrganizationId,
  type ProjectId,
  putInDisk,
  StorageDisk,
  type StorageError,
} from "@domain/shared"
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

    yield* publisher
      .publish("span-ingestion", "ingest", {
        fileKey,
        contentType: input.contentType,
        organizationId: input.organizationId,
        projectId: input.projectId,
        apiKeyId: input.apiKeyId,
        ingestedAt: new Date().toISOString(),
      })
      .pipe(Effect.tapError(() => deleteFromDisk(disk, fileKey).pipe(Effect.ignore)))
  })
