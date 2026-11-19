import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { embedMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
}))

class FakeVoyageAIClient {
  embed(request: unknown) {
    return embedMock(request)
  }
}

vi.mock("node:module", () => ({
  createRequire: () => (id: string) => {
    if (id === "voyageai") return { VoyageAIClient: FakeVoyageAIClient }
    throw new Error(`unexpected require in test: ${id}`)
  },
}))

const { embedWithVoyage } = await import("./ai.ts")

// Mirrors the Voyage SDK's own miscategorized abort-timeout: a generic
// `VoyageAIError` (not the purpose-built `VoyageAITimeoutError`) whose
// message is exactly "timeout" — see the comment on isRetryableVoyageTimeout.
const voyageTimeoutError = () => Object.assign(new Error("timeout"), { name: "VoyageAIError" })

const originalApiKey = process.env.LAT_VOYAGE_API_KEY

beforeEach(() => {
  process.env.LAT_VOYAGE_API_KEY = "test-voyage-key"
  embedMock.mockReset()
})

afterEach(() => {
  process.env.LAT_VOYAGE_API_KEY = originalApiKey
})

describe("embedWithVoyage timeout retry", () => {
  it("retries once on the SDK's timeout signature and succeeds", async () => {
    embedMock
      .mockRejectedValueOnce(voyageTimeoutError())
      .mockResolvedValueOnce({ data: [{ embedding: Array(EMBEDDING_DIMENSIONS).fill(0) }], usage: { totalTokens: 3 } })

    const result = await Effect.runPromise(
      embedWithVoyage({ text: "hello", provider: "voyage", model: "voyage-4-large" }),
    )

    expect(result.embedding).toHaveLength(EMBEDDING_DIMENSIONS)
    expect(embedMock).toHaveBeenCalledTimes(2)
  })

  it("gives up after one retry when the timeout persists", async () => {
    embedMock.mockRejectedValue(voyageTimeoutError())

    const exit = await Effect.runPromiseExit(
      embedWithVoyage({ text: "hello", provider: "voyage", model: "voyage-4-large" }),
    )

    expect(exit._tag).toBe("Failure")
    expect(embedMock).toHaveBeenCalledTimes(2)
  })

  it("does not retry a non-timeout Voyage error", async () => {
    embedMock.mockRejectedValue(Object.assign(new Error("Bad Request"), { name: "VoyageAIError", statusCode: 400 }))

    const exit = await Effect.runPromiseExit(
      embedWithVoyage({ text: "hello", provider: "voyage", model: "voyage-4-large" }),
    )

    expect(exit._tag).toBe("Failure")
    expect(embedMock).toHaveBeenCalledTimes(1)
  })
})
