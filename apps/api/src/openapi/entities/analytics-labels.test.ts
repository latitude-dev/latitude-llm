import { ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { SignalRepository } from "@domain/signals"
import { TaxonomyClusterRepository } from "@domain/taxonomy"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type BreakdownLabels, resolveBreakdownLabels } from "./analytics-labels.ts"

const projectId = ProjectId("prj00000000000000000001")

// Minimal stubs — the resolvers only touch findByIds / listByIds. The repo shapes
// aren't exported, so cast at the layer boundary; the runtime object is real.
const signalStub = {
  findByIds: ({ signalIds }: { signalIds: readonly string[] }) =>
    Effect.succeed(signalIds.map((id) => ({ id, name: `Signal ${id}` }))),
}
const clusterStub = {
  listByIds: (ids: readonly string[]) => Effect.succeed(ids.map((id) => ({ id, name: `Cluster ${id}` }))),
}

const layers = Layer.mergeAll(
  Layer.succeed(SignalRepository, signalStub as unknown as never),
  Layer.succeed(TaxonomyClusterRepository, clusterStub as unknown as never),
  Layer.succeed(SqlClient, createFakeSqlClient()),
)

const run = (input: Parameters<typeof resolveBreakdownLabels>[0]): Promise<BreakdownLabels | undefined> =>
  Effect.runPromise(resolveBreakdownLabels(input).pipe(Effect.provide(layers)))

describe("resolveBreakdownLabels", () => {
  it("names `signalId` breakdown keys via the signals repo", async () => {
    const labels = await run({ stream: "scores", breakdown: "signalId", projectId, keys: ["sig_a", "sig_b"] })
    expect(labels && Object.fromEntries(labels)).toEqual({ sig_a: "Signal sig_a", sig_b: "Signal sig_b" })
  })

  it("names `cluster` breakdown keys via the taxonomy repo", async () => {
    const labels = await run({ stream: "behaviors", breakdown: "cluster", projectId, keys: ["c1", "c2"] })
    expect(labels && Object.fromEntries(labels)).toEqual({ c1: "Cluster c1", c2: "Cluster c2" })
  })

  it("returns undefined for a readable breakdown with no resolver", async () => {
    expect(await run({ stream: "traces", breakdown: "model", projectId, keys: ["gpt-4o"] })).toBeUndefined()
    expect(await run({ stream: "scores", breakdown: "source", projectId, keys: ["custom"] })).toBeUndefined()
  })

  it("returns undefined when there is nothing to resolve", async () => {
    expect(await run({ stream: "scores", breakdown: "signalId", projectId, keys: [] })).toBeUndefined()
    expect(await run({ stream: "scores", breakdown: undefined, projectId, keys: ["sig_a"] })).toBeUndefined()
  })
})
