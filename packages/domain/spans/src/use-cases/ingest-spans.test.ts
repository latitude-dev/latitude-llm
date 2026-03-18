import type { QueuePublisherShape } from "@domain/queue"
import { QueuePublishError, QueuePublisher } from "@domain/queue"
import { OrganizationId, ProjectId, StorageDisk, type StorageDiskPort, StorageError } from "@domain/shared"
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

const createFakeDisk = () => {
  const written: { key: string; contents: string | Uint8Array }[] = []
  const deleted: string[] = []
  const disk: StorageDiskPort = {
    put: async (key, contents) => {
      written.push({ key, contents })
    },
    putStream: async () => {},
    get: async () => "",
    getBytes: async () => new Uint8Array(),
    getStream: async () => new ReadableStream(),
    delete: async (key) => {
      deleted.push(key)
    },
    getSignedUrl: async () => "",
  }
  return { disk, written, deleted }
}

const createFakePublisher = () => {
  const published: { queue: string; message: { body: Uint8Array; key: string | null } }[] = []
  const publisher: QueuePublisherShape = {
    publish: (queue, message) => {
      published.push({ queue, message: { body: message.body, key: message.key } })
      return Effect.void
    },
    close: () => Effect.void,
  }
  return { publisher, published }
}

const runUseCase = (diskPort: StorageDiskPort, publisher: QueuePublisherShape) =>
  ingestSpansUseCase(validInput).pipe(
    Effect.provide(Layer.succeed(StorageDisk, diskPort)),
    Effect.provide(Layer.succeed(QueuePublisher, publisher)),
  )

describe("ingestSpansUseCase", () => {
  it("stores payload to disk and publishes queue message", async () => {
    const { disk, written } = createFakeDisk()
    const { publisher, published } = createFakePublisher()

    await Effect.runPromise(runUseCase(disk, publisher))

    expect(written).toHaveLength(1)
    expect(written[0]?.key).toContain("organizations/org-1/projects/proj-1/ingest/")
    expect(written[0]?.key).toMatch(/\.json$/)

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("span-ingestion")
    const body = new TextDecoder().decode(published[0]?.message.body)
    expect(body).toBe(written[0]?.key)
  })

  it("uses protobuf extension for protobuf content type", async () => {
    const { disk, written } = createFakeDisk()
    const { publisher } = createFakePublisher()

    await Effect.runPromise(
      ingestSpansUseCase({ ...validInput, contentType: "application/x-protobuf" }).pipe(
        Effect.provide(Layer.succeed(StorageDisk, disk)),
        Effect.provide(Layer.succeed(QueuePublisher, publisher)),
      ),
    )

    expect(written[0]?.key).toMatch(/\.protobuf$/)
  })

  it("fails with StorageError when disk write fails", async () => {
    const failingDisk: StorageDiskPort = {
      put: async () => {
        throw new Error("disk unavailable")
      },
      putStream: async () => {},
      get: async () => "",
      getBytes: async () => new Uint8Array(),
      getStream: async () => new ReadableStream(),
      delete: async () => {},
      getSignedUrl: async () => "",
    }
    const { publisher, published } = createFakePublisher()

    const res = await Effect.runPromise(
      Effect.result(
        ingestSpansUseCase(validInput).pipe(
          Effect.provide(Layer.succeed(StorageDisk, failingDisk)),
          Effect.provide(Layer.succeed(QueuePublisher, publisher)),
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
    const { disk, written, deleted } = createFakeDisk()
    const failingPublisher: QueuePublisherShape = {
      publish: (queue) => Effect.fail(new QueuePublishError({ cause: new Error("queue down"), queue })),
      close: () => Effect.void,
    }

    const res = await Effect.runPromise(
      Effect.result(
        ingestSpansUseCase(validInput).pipe(
          Effect.provide(Layer.succeed(StorageDisk, disk)),
          Effect.provide(Layer.succeed(QueuePublisher, failingPublisher)),
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
      expect(err.httpStatus).toBe(500)
      expect(err.httpMessage).toContain("span-ingestion")
    }
  })

  it("does not publish when storage fails (sequential guarantee)", async () => {
    const failingDisk: StorageDiskPort = {
      put: async () => {
        throw new Error("disk error")
      },
      putStream: async () => {},
      get: async () => "",
      getBytes: async () => new Uint8Array(),
      getStream: async () => new ReadableStream(),
      delete: async () => {},
      getSignedUrl: async () => "",
    }
    const { publisher, published } = createFakePublisher()

    await Effect.runPromise(
      Effect.result(
        ingestSpansUseCase(validInput).pipe(
          Effect.provide(Layer.succeed(StorageDisk, failingDisk)),
          Effect.provide(Layer.succeed(QueuePublisher, publisher)),
        ),
      ),
    )

    expect(published).toHaveLength(0)
  })

  it("passes correct headers in queue message", async () => {
    const { disk } = createFakeDisk()
    const capturedHeaders: Map<string, string>[] = []
    const publisher: QueuePublisherShape = {
      publish: (_queue, message) => {
        capturedHeaders.push(new Map(message.headers))
        return Effect.void
      },
      close: () => Effect.void,
    }

    await Effect.runPromise(
      ingestSpansUseCase(validInput).pipe(
        Effect.provide(Layer.succeed(StorageDisk, disk)),
        Effect.provide(Layer.succeed(QueuePublisher, publisher)),
      ),
    )

    expect(capturedHeaders).toHaveLength(1)
    const headers = capturedHeaders[0] as Map<string, string>
    expect(headers.get("content-type")).toBe("application/json")
    expect(headers.get("organization-id")).toBe("org-1")
    expect(headers.get("project-id")).toBe("proj-1")
    expect(headers.get("api-key-id")).toBe("key-1")
    expect(headers.get("ingested-at")).toBeDefined()
  })
})
