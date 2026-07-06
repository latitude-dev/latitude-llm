import { OrganizationId, ProjectId } from "@domain/shared"
import { type MessageEmbedding, MessageEmbeddingRepository, TraceSearchRepository } from "@domain/spans"
import { createFakeMessageEmbeddingRepository, createFakeTraceSearchRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { hasSessionEmbeddings } from "./has-session-embeddings.ts"

const ORG = OrganizationId("org")
const PROJECT = ProjectId("proj")

const embeddingRow = (contentHash: string, embeddingModel: string): MessageEmbedding => ({
  organizationId: ORG,
  projectId: PROJECT,
  contentHash,
  embedding: [1, 0, 0],
  embeddingModel,
  insertedAt: new Date(0),
})

const run = (opts: {
  readonly traceIds?: readonly string[]
  readonly occurrences?: ReadonlyArray<{ contentHash: string; role: "user" | "assistant" }>
  readonly storedModel?: string | null
}) => {
  const findByHashesModels: Array<string | undefined> = []
  const occurrenceCalls: number[] = []

  const traceSearchRepo = createFakeTraceSearchRepository({
    listMessageOccurrencesForTraces: () => {
      occurrenceCalls.push(1)
      return Effect.succeed(opts.occurrences ?? [])
    },
  }).repository

  const embeddingRepo = createFakeMessageEmbeddingRepository({
    findByHashes: ({ contentHashes, embeddingModel }) => {
      findByHashesModels.push(embeddingModel)
      if (opts.storedModel == null || opts.storedModel !== embeddingModel) return Effect.succeed([])
      return Effect.succeed(contentHashes.map((contentHash) => embeddingRow(contentHash, embeddingModel)))
    },
  }).repository

  const layer = Layer.mergeAll(
    Layer.succeed(MessageEmbeddingRepository, embeddingRepo),
    Layer.succeed(TraceSearchRepository, traceSearchRepo),
  )

  const ready = Effect.runSync(
    hasSessionEmbeddings({
      organizationId: ORG,
      projectId: PROJECT,
      traceIds: opts.traceIds ?? ["t1"],
    }).pipe(Effect.provide(layer)),
  )

  return { ready, findByHashesModels, occurrenceCalls }
}

describe("hasSessionEmbeddings", () => {
  it("is false without touching the repos when no trace ids are given", () => {
    const { ready, occurrenceCalls } = run({ traceIds: [] })
    expect(ready).toBe(false)
    expect(occurrenceCalls).toHaveLength(0)
  })

  it("is false when the session has no occurrences", () => {
    const { ready } = run({ occurrences: [] })
    expect(ready).toBe(false)
  })

  it("is false when occurrences exist but no vectors are stored (over budget / provider failure)", () => {
    const { ready } = run({
      occurrences: [
        { contentHash: "hash-a", role: "user" },
        { contentHash: "hash-b", role: "assistant" },
      ],
      storedModel: null,
    })
    expect(ready).toBe(false)
  })

  it("is true when at least one occurrence has a vector for the active model", () => {
    const { ready, findByHashesModels } = run({
      occurrences: [{ contentHash: "hash-a", role: "user" }],
      storedModel: "voyage-4-large",
    })
    expect(ready).toBe(true)
    expect(findByHashesModels).toEqual(["voyage-4-large"])
  })

  it("is false when vectors exist only under a different embedding model", () => {
    const { ready } = run({
      occurrences: [{ contentHash: "hash-a", role: "user" }],
      storedModel: "some-old-model",
    })
    expect(ready).toBe(false)
  })
})
