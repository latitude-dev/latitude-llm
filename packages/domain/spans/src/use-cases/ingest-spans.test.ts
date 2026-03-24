import type { QueuePublisherShape } from "@domain/queue"
import { QueuePublishError, QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { OrganizationId, ProjectId, StorageDisk, type StorageDiskPort, StorageError } from "@domain/shared"
import { createFakeStorageDisk } from "@domain/shared/testing"
import { Effect, Layer, Result } from "effect"
import { describe, expect, it } from "vitest"
import { ingestSpansUseCase } from "./ingest-spans.ts"

const validInput = {
  organizationId: OrganizationId("org-1"),
  projectId: ProjectId("proj-1"),
  apiKeyId: "key-1",
  payload: new TextEncoder().encode('{"spans":[]}'),
  contentType: "application/json",
}

const runUseCase = (diskPort: StorageDiskPort, publisher: QueuePublisherShape) =>
  ingestSpansUseCase(validInput).pipe(
    Effect.provide(Layer.merge(Layer.succeed(StorageDisk, diskPort), Layer.succeed(QueuePublisher, publisher))),
  )

describe("ingestSpansUseCase", () => {
  it("stores payload to disk and publishes queue message", async () => {
    const { disk, written } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(runUseCase(disk, publisher))

    expect(written).toHaveLength(1)
    expect(written[0]?.key).toContain("organizations/org-1/projects/proj-1/ingest/")
    expect(written[0]?.key).toMatch(/\.json$/)

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("span-ingestion")
    expect(published[0]?.task).toBe("ingest")
    expect((published[0]?.payload as { fileKey: string }).fileKey).toBe(written[0]?.key)
  })

  it("uses protobuf extension for protobuf content type", async () => {
    const { disk, written } = createFakeStorageDisk()
    const { publisher } = createFakeQueuePublisher()

    await Effect.runPromise(
      ingestSpansUseCase({ ...validInput, contentType: "application/x-protobuf" }).pipe(
        Effect.provide(Layer.merge(Layer.succeed(StorageDisk, disk), Layer.succeed(QueuePublisher, publisher))),
      ),
    )

    expect(written[0]?.key).toMatch(/\.protobuf$/)
  })

  it("fails with StorageError when disk write fails", async () => {
    const { disk } = createFakeStorageDisk({
      put: async () => {
        throw new Error("disk unavailable")
      },
    })
    const { publisher, published } = createFakeQueuePublisher()

    const res = await Effect.runPromise(
      Effect.result(
        ingestSpansUseCase(validInput).pipe(
          Effect.provide(Layer.merge(Layer.succeed(StorageDisk, disk), Layer.succeed(QueuePublisher, publisher))),
        ),
      ),
    )

    expect(Result.isFailure(res)).toBe(true)
    if (Result.isFailure(res)) {
      expect(res.failure._tag).toBe("StorageError")
      expect(res.failure).toBeInstanceOf(StorageError)
    }
    expect(published).toHaveLength(0)
  })

  it("fails with QueuePublishError and cleans up file when publish fails", async () => {
    const { disk, written, deleted } = createFakeStorageDisk()
    const { publisher } = createFakeQueuePublisher({
      publish: (queue) => Effect.fail(new QueuePublishError({ cause: new Error("queue down"), queue })),
    })

    const res = await Effect.runPromise(
      Effect.result(
        ingestSpansUseCase(validInput).pipe(
          Effect.provide(Layer.merge(Layer.succeed(StorageDisk, disk), Layer.succeed(QueuePublisher, publisher))),
        ),
      ),
    )

    expect(written).toHaveLength(1)
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toBe(written[0]?.key)
    expect(Result.isFailure(res)).toBe(true)
    if (Result.isFailure(res)) {
      expect(res.failure._tag).toBe("QueuePublishError")
      expect(res.failure).toBeInstanceOf(QueuePublishError)
      const err = res.failure as QueuePublishError
      expect(err.httpStatus).toBe(502)
      expect(err.httpMessage).toContain("span-ingestion")
    }
  })

  it("does not publish when storage fails (sequential guarantee)", async () => {
    const { disk } = createFakeStorageDisk({
      put: async () => {
        throw new Error("disk error")
      },
    })
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      Effect.result(
        ingestSpansUseCase(validInput).pipe(
          Effect.provide(Layer.merge(Layer.succeed(StorageDisk, disk), Layer.succeed(QueuePublisher, publisher))),
        ),
      ),
    )

    expect(published).toHaveLength(0)
  })

  it("passes ingest fields in queue payload", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      ingestSpansUseCase(validInput).pipe(
        Effect.provide(Layer.merge(Layer.succeed(StorageDisk, disk), Layer.succeed(QueuePublisher, publisher))),
      ),
    )

    expect(published).toHaveLength(1)
    const payload = published[0]?.payload as {
      contentType: string
      organizationId: string
      projectId: string
      apiKeyId: string
      ingestedAt: string
    }
    expect(payload.contentType).toBe("application/json")
    expect(payload.organizationId).toBe("org-1")
    expect(payload.projectId).toBe("proj-1")
    expect(payload.apiKeyId).toBe("key-1")
    expect(payload.ingestedAt).toBeDefined()
  })
})
