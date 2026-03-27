import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createFakeIssueProjectionRepository } from "../testing/fake-issue-projection-repository.ts"

const TENANT = "org1:proj1"

function makeVector(seed: number, dims = 8): number[] {
  const vec = Array.from({ length: dims }, (_, i) => Math.sin(seed + i))
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  return vec.map((v) => v / norm)
}

describe("IssueProjectionRepository (fake)", () => {
  describe("upsert", () => {
    it("inserts a new projection", async () => {
      const { service, store } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          uuid: "uuid-1",
          title: "Secret leakage",
          description: "Agent exposes private tokens in answers",
          vector: makeVector(1),
          tenantName: TENANT,
        }),
      )

      expect(store.size).toBe(1)
    })

    it("overwrites an existing projection with the same uuid and tenant", async () => {
      const { service, store } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          uuid: "uuid-1",
          title: "Original title",
          description: "Original description",
          vector: makeVector(1),
          tenantName: TENANT,
        }),
      )

      await Effect.runPromise(
        service.upsert({
          uuid: "uuid-1",
          title: "Updated title",
          description: "Updated description",
          vector: makeVector(2),
          tenantName: TENANT,
        }),
      )

      expect(store.size).toBe(1)
      const entry = store.get(`${TENANT}::uuid-1`)
      expect(entry?.title).toBe("Updated title")
    })
  })

  describe("delete", () => {
    it("removes an existing projection", async () => {
      const { service, store } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          uuid: "uuid-1",
          title: "To be deleted",
          description: "Will be removed",
          vector: makeVector(1),
          tenantName: TENANT,
        }),
      )

      await Effect.runPromise(service.delete({ uuid: "uuid-1", tenantName: TENANT }))

      expect(store.size).toBe(0)
    })

    it("does nothing when deleting a non-existent projection", async () => {
      const { service } = createFakeIssueProjectionRepository()

      await Effect.runPromise(service.delete({ uuid: "missing", tenantName: TENANT }))
    })
  })

  describe("hybridSearch", () => {
    it("returns candidates ranked by combined score", async () => {
      const { service } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          uuid: "uuid-1",
          title: "Secret leakage in answers",
          description: "Agent exposes private tokens and API keys",
          vector: makeVector(1),
          tenantName: TENANT,
        }),
      )

      await Effect.runPromise(
        service.upsert({
          uuid: "uuid-2",
          title: "Hallucinated citations",
          description: "Agent invents fake references and sources",
          vector: makeVector(5),
          tenantName: TENANT,
        }),
      )

      const results = await Effect.runPromise(
        service.hybridSearch({
          query: "secret tokens API keys",
          vector: makeVector(1),
          tenantName: TENANT,
          alpha: 0.75,
          limit: 10,
        }),
      )

      expect(results.length).toBe(2)
      expect(results[0]?.uuid).toBe("uuid-1")
      expect(results[0]?.score).toBeGreaterThan(results[1]?.score)
    })

    it("respects the limit parameter", async () => {
      const { service } = createFakeIssueProjectionRepository()

      for (let i = 0; i < 5; i++) {
        await Effect.runPromise(
          service.upsert({
            uuid: `uuid-${i}`,
            title: `Issue ${i} about tokens`,
            description: `Description ${i}`,
            vector: makeVector(i),
            tenantName: TENANT,
          }),
        )
      }

      const results = await Effect.runPromise(
        service.hybridSearch({
          query: "tokens",
          vector: makeVector(0),
          tenantName: TENANT,
          alpha: 0.5,
          limit: 2,
        }),
      )

      expect(results.length).toBe(2)
    })

    it("filters by tenant name", async () => {
      const { service } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          uuid: "uuid-1",
          title: "Secret leakage",
          description: "Tokens exposed",
          vector: makeVector(1),
          tenantName: "org1:proj1",
        }),
      )

      await Effect.runPromise(
        service.upsert({
          uuid: "uuid-2",
          title: "Secret leakage too",
          description: "Tokens exposed too",
          vector: makeVector(1),
          tenantName: "org2:proj2",
        }),
      )

      const results = await Effect.runPromise(
        service.hybridSearch({
          query: "secret tokens",
          vector: makeVector(1),
          tenantName: "org1:proj1",
          alpha: 0.75,
          limit: 10,
        }),
      )

      expect(results.length).toBe(1)
      expect(results[0]?.uuid).toBe("uuid-1")
    })

    it("returns empty array when no projections exist for tenant", async () => {
      const { service } = createFakeIssueProjectionRepository()

      const results = await Effect.runPromise(
        service.hybridSearch({
          query: "anything",
          vector: makeVector(1),
          tenantName: TENANT,
          alpha: 0.75,
          limit: 10,
        }),
      )

      expect(results).toEqual([])
    })
  })
})
