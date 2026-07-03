import type { EmbedInput } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import type { HostSimilarityFunction } from "@domain/sandbox"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  type MessageEmbedding,
  MessageEmbeddingRepository,
  type MessageEmbeddingUpsert,
  TraceSearchRepository,
} from "@domain/spans"
import { createFakeMessageEmbeddingRepository, createFakeTraceSearchRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { buildSemanticSimilarityHost } from "./semantic-similarity.ts"

const ORG = OrganizationId("org")
const PROJECT = ProjectId("proj")

const embeddingRow = (contentHash: string, embedding: readonly number[]): MessageEmbedding => ({
  organizationId: ORG,
  projectId: PROJECT,
  contentHash,
  embedding,
  embeddingModel: "voyage-4-large",
  insertedAt: new Date(0),
})

const buildHost = (opts: {
  readonly occurrences?: ReadonlyArray<{ contentHash: string; role: "user" | "assistant" }>
  readonly stored?: Record<string, readonly number[]>
  readonly embed?: (input: EmbedInput) => ReturnType<ReturnType<typeof createFakeAI>["ai"]["embed"]>
}) => {
  const occurrenceCalls: number[] = []
  const findByHashesCalls: string[][] = []
  const upserted: MessageEmbeddingUpsert[][] = []
  const embedCalls: EmbedInput[] = []
  const stored = opts.stored ?? {}

  const traceSearchRepo = createFakeTraceSearchRepository({
    listMessageOccurrencesForTraces: () => {
      occurrenceCalls.push(1)
      return Effect.succeed(opts.occurrences ?? [])
    },
  }).repository

  const embeddingRepo = createFakeMessageEmbeddingRepository({
    findByHashes: ({ contentHashes }) => {
      findByHashesCalls.push([...contentHashes])
      return Effect.succeed(
        contentHashes.flatMap((contentHash) =>
          stored[contentHash] ? [embeddingRow(contentHash, stored[contentHash])] : [],
        ),
      )
    },
    upsertMany: (rows) => {
      upserted.push([...rows])
      for (const row of rows) stored[row.contentHash] = row.embedding
      return Effect.void
    },
  }).repository

  const fakeAi = createFakeAI({
    embed: (input) => {
      embedCalls.push(input)
      return opts.embed ? opts.embed(input) : Effect.succeed({ embedding: [1, 0, 0] })
    },
  })

  const layer = Layer.mergeAll(
    Layer.succeed(MessageEmbeddingRepository, embeddingRepo),
    Layer.succeed(TraceSearchRepository, traceSearchRepo),
    fakeAi.layer,
  )

  const host = Effect.runSync(
    buildSemanticSimilarityHost({ organizationId: ORG, projectId: PROJECT, traceIds: ["t1"] }).pipe(
      Effect.provide(layer),
    ),
  ) as HostSimilarityFunction

  return { host, occurrenceCalls, findByHashesCalls, upserted, embedCalls }
}

describe("buildSemanticSimilarityHost", () => {
  it("returns the max cosine over the session's stored vectors", async () => {
    const { host } = buildHost({
      occurrences: [
        { contentHash: "hash-a", role: "user" },
        { contentHash: "hash-b", role: "assistant" },
      ],
      stored: { "hash-a": [1, 0, 0], "hash-b": [0, 1, 0] },
      // Query embeds to [1,0,0] → cosine 1 with hash-a, 0 with hash-b → max 1.
      embed: () => Effect.succeed({ embedding: [1, 0, 0] }),
    })

    const result = await host({ query: "frustration" })
    expect(result.similarity).toBeCloseTo(1)
  })

  it("memoizes the session read and reuses the embedded query across calls", async () => {
    const { host, occurrenceCalls, embedCalls } = buildHost({
      occurrences: [{ contentHash: "hash-a", role: "user" }],
      stored: { "hash-a": [1, 0, 0] },
    })

    await host({ query: "frustration" })
    await host({ query: "frustration" })
    await host({ query: "anger" })

    // Occurrences fetched once for the whole run.
    expect(occurrenceCalls).toHaveLength(1)
    // "frustration" embedded once (second call reuses it); "anger" embedded once.
    expect(embedCalls).toHaveLength(2)
  })

  it("fetches only the new hash on a second distinct query, without re-reading the session", async () => {
    const { host, occurrenceCalls, findByHashesCalls, embedCalls } = buildHost({
      occurrences: [{ contentHash: "hash-a", role: "user" }],
      stored: { "hash-a": [1, 0, 0] },
    })

    await host({ query: "one" })
    await host({ query: "two" })

    // Occurrences read once for the whole run (session read is memoized).
    expect(occurrenceCalls).toHaveLength(1)
    // First call batches the query hash + session hashes; the second fetches only the new query hash.
    expect(findByHashesCalls).toHaveLength(2)
    expect(findByHashesCalls[0]).toContain("hash-a")
    expect(findByHashesCalls[1]).toHaveLength(1)
    expect(findByHashesCalls[1]).not.toContain("hash-a")
    expect(embedCalls).toHaveLength(2)
  })

  it("embeds the query as a document on a miss and persists it content-addressed", async () => {
    const { host, upserted, embedCalls } = buildHost({
      occurrences: [{ contentHash: "hash-a", role: "user" }],
      stored: { "hash-a": [0, 1, 0] },
      embed: () => Effect.succeed({ embedding: [0, 1, 0] }),
    })

    const result = await host({ query: "frustration" })
    expect(embedCalls[0]?.inputType).toBe("document")
    expect(result.similarity).toBeCloseTo(1)
    expect(upserted).toHaveLength(1)
    expect(upserted[0]?.[0]?.embeddingModel).toBe("voyage-4-large")
  })

  it("returns 0 (never a skip) and does not embed when the session has no occurrences", async () => {
    const { host, embedCalls } = buildHost({ occurrences: [] })
    const result = await host({ query: "frustration" })
    expect(result.similarity).toBe(0)
    expect(embedCalls).toHaveLength(0)
  })

  it("returns 0 without embedding the query when occurrences exist but no vectors are stored yet", async () => {
    // The state that hung the preview: trace_message_occurrences written at ingest, but message_embeddings
    // empty (embeddings disabled/unreachable). Nothing to compare against → 0, and crucially no query embed.
    const { host, embedCalls } = buildHost({
      occurrences: [
        { contentHash: "hash-a", role: "user" },
        { contentHash: "hash-b", role: "assistant" },
      ],
      stored: {},
    })
    const result = await host({ query: "frustration" })
    expect(result.similarity).toBe(0)
    expect(embedCalls).toHaveLength(0)
  })

  it("enforces the per-run call cap", async () => {
    const { host } = buildHost({
      occurrences: [{ contentHash: "hash-a", role: "user" }],
      stored: { "hash-a": [1, 0, 0] },
    })

    for (let index = 0; index < 50; index++) {
      await host({ query: `query-${index}` })
    }
    await expect(host({ query: "one-too-many" })).rejects.toThrow(/per-run call cap/)
  })
})
