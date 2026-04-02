import type { QueuePublisherShape } from "@domain/queue"
import { QueuePublishError, QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { OrganizationId, ProjectId, StorageDisk, type StorageDiskPort } from "@domain/shared"
import { createFakeStorageDisk } from "@domain/shared/testing"
import { Effect, Layer, Result } from "effect"
import { describe, expect, it } from "vitest"
import { ingestSpansUseCase } from "./ingest-spans.ts"

const smallPayload = new TextEncoder().encode('{"spans":[]}')

function base64ToUtf8(b64: string): string {
  const binary = globalThis.atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

const largePayload = new Uint8Array(60_000).fill(65) // 60 KB, above 50 KB threshold

const makeInput = (payload: Uint8Array) => ({
  organizationId: OrganizationId("org-1"),
  projectId: ProjectId("proj-1"),
  apiKeyId: "key-1",
  payload,
  contentType: "application/json",
})

const runUseCase = (input: ReturnType<typeof makeInput>, diskPort: StorageDiskPort, publisher: QueuePublisherShape) =>
  ingestSpansUseCase(input).pipe(
    Effect.provide(Layer.merge(Layer.succeed(StorageDisk, diskPort), Layer.succeed(QueuePublisher, publisher))),
  )

describe("ingestSpansUseCase", () => {
  it("inlines small payloads without writing to disk", async () => {
    const { disk, written } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(runUseCase(makeInput(smallPayload), disk, publisher))

    expect(written).toHaveLength(0)
    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("span-ingestion")
    expect(published[0]?.task).toBe("ingest")

    const payload = published[0]?.payload as { fileKey: string | null; inlinePayload: string | null }
    expect(payload.fileKey).toBeNull()
    expect(payload.inlinePayload).toBeDefined()
    expect(base64ToUtf8(payload.inlinePayload ?? "")).toBe('{"spans":[]}')
  })

  it("writes large payloads to disk and sends fileKey", async () => {
    const { disk, written } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(runUseCase(makeInput(largePayload), disk, publisher))

    expect(written).toHaveLength(1)
    expect(written[0]?.key).toContain("tmp-ingest/org-1/proj-1/")

    expect(published).toHaveLength(1)
    const payload = published[0]?.payload as { fileKey: string | null; inlinePayload: string | null }
    expect(payload.fileKey).toBe(written[0]?.key)
    expect(payload.inlinePayload).toBeNull()
  })

  it("uses protobuf extension for protobuf content type", async () => {
    const { disk, written } = createFakeStorageDisk()
    const { publisher } = createFakeQueuePublisher()

    await Effect.runPromise(
      ingestSpansUseCase({ ...makeInput(largePayload), contentType: "application/x-protobuf" }).pipe(
        Effect.provide(Layer.merge(Layer.succeed(StorageDisk, disk), Layer.succeed(QueuePublisher, publisher))),
      ),
    )

    expect(written[0]?.key).toMatch(/\.protobuf$/)
  })

  it("fails with StorageError when disk write fails for large payloads", async () => {
    const { disk } = createFakeStorageDisk({
      put: async () => {
        throw new Error("disk unavailable")
      },
    })
    const { publisher, published } = createFakeQueuePublisher()

    const res = await Effect.runPromise(Effect.result(runUseCase(makeInput(largePayload), disk, publisher)))

    expect(Result.isFailure(res)).toBe(true)
    if (Result.isFailure(res)) {
      expect(res.failure._tag).toBe("StorageError")
    }
    expect(published).toHaveLength(0)
  })

  it("fails with QueuePublishError when publish fails (inline path)", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher } = createFakeQueuePublisher({
      publish: (queue) => Effect.fail(new QueuePublishError({ cause: new Error("queue down"), queue })),
    })

    const res = await Effect.runPromise(Effect.result(runUseCase(makeInput(smallPayload), disk, publisher)))

    expect(Result.isFailure(res)).toBe(true)
    if (Result.isFailure(res)) {
      expect(res.failure._tag).toBe("QueuePublishError")
    }
  })

  it("passes ingest fields in queue payload", async () => {
    const { disk } = createFakeStorageDisk()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(runUseCase(makeInput(smallPayload), disk, publisher))

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
