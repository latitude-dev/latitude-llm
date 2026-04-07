import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ISSUE_DISCOVERY_MAX_CANDIDATES } from "../constants.ts"
import { createFakeIssueProjectionRepository } from "../testing/fake-issue-projection-repository.ts"

const organizationId = "org1"
const projectId = "proj1"

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
          organizationId,
          projectId,
          uuid: "uuid-1",
          title: "Secret leakage",
          description: "Agent exposes private tokens in answers",
          vector: makeVector(1),
        }),
      )

      expect(store.size).toBe(1)
    })

    it("overwrites an existing projection with the same uuid and tenant", async () => {
      const { service, store } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          organizationId,
          projectId,
          uuid: "uuid-1",
          title: "Original title",
          description: "Original description",
          vector: makeVector(1),
        }),
      )

      await Effect.runPromise(
        service.upsert({
          organizationId,
          projectId,
          uuid: "uuid-1",
          title: "Updated title",
          description: "Updated description",
          vector: makeVector(2),
        }),
      )

      expect(store.size).toBe(1)
      const entry = store.get(`${organizationId}_${projectId}::uuid-1`)
      expect(entry?.title).toBe("Updated title")
    })
  })

  describe("delete", () => {
    it("removes an existing projection", async () => {
      const { service, store } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          organizationId,
          projectId,
          uuid: "uuid-1",
          title: "To be deleted",
          description: "Will be removed",
          vector: makeVector(1),
        }),
      )

      await Effect.runPromise(service.delete({ organizationId, projectId, uuid: "uuid-1" }))

      expect(store.size).toBe(0)
    })

    it("does nothing when deleting a non-existent projection", async () => {
      const { service } = createFakeIssueProjectionRepository()

      await Effect.runPromise(service.delete({ organizationId, projectId, uuid: "missing" }))
    })
  })

  describe("hybridSearch", () => {
    it("returns candidates ranked by combined score", async () => {
      const { service } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          organizationId,
          projectId,
          uuid: "uuid-1",
          title: "Secret leakage in answers",
          description: "Agent exposes private tokens and API keys",
          vector: makeVector(1),
        }),
      )

      await Effect.runPromise(
        service.upsert({
          organizationId,
          projectId,
          uuid: "uuid-2",
          title: "Hallucinated citations",
          description: "Agent invents fake references and sources",
          vector: makeVector(5),
        }),
      )

      const results = await Effect.runPromise(
        service.hybridSearch({
          organizationId,
          projectId,
          query: "secret tokens API keys",
          vector: makeVector(1),
        }),
      )

      expect(results.length).toBe(2)
      expect(results[0]?.uuid).toBe("uuid-1")
      expect(results[0]?.score).toBeGreaterThan(results[1]?.score)
    })

    it("returns all results up to the configured max candidates", async () => {
      const { service } = createFakeIssueProjectionRepository()

      for (let i = 0; i < 5; i++) {
        await Effect.runPromise(
          service.upsert({
            organizationId,
            projectId,
            uuid: `uuid-${i}`,
            title: `Issue ${i} about tokens`,
            description: `Description ${i}`,
            vector: makeVector(i),
          }),
        )
      }

      const results = await Effect.runPromise(
        service.hybridSearch({
          organizationId,
          projectId,
          query: "tokens",
          vector: makeVector(0),
        }),
      )

      expect(results.length).toBe(5)
      expect(results.length).toBeLessThanOrEqual(ISSUE_DISCOVERY_MAX_CANDIDATES)
    })

    it("filters by tenant name", async () => {
      const { service } = createFakeIssueProjectionRepository()

      await Effect.runPromise(
        service.upsert({
          organizationId,
          projectId,
          uuid: "uuid-1",
          title: "Secret leakage",
          description: "Tokens exposed",
          vector: makeVector(1),
        }),
      )

      await Effect.runPromise(
        service.upsert({
          organizationId: "org2",
          projectId: "proj2",
          uuid: "uuid-2",
          title: "Secret leakage too",
          description: "Tokens exposed too",
          vector: makeVector(1),
        }),
      )

      const results = await Effect.runPromise(
        service.hybridSearch({
          organizationId,
          projectId,
          query: "secret tokens",
          vector: makeVector(1),
        }),
      )

      expect(results.length).toBe(1)
      expect(results[0]?.uuid).toBe("uuid-1")
    })

    it("returns empty array when no projections exist for tenant", async () => {
      const { service } = createFakeIssueProjectionRepository()

      const results = await Effect.runPromise(
        service.hybridSearch({
          organizationId,
          projectId,
          query: "anything",
          vector: makeVector(1),
        }),
      )

      expect(results).toEqual([])
    })
  })
})
