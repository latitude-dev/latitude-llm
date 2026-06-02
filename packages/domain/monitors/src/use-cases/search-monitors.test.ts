import { MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Monitor } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { createFakeMonitorRepository } from "../testing/fake-monitor-repository.ts"
import { searchMonitorsUseCase } from "./search-monitors.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectA = ProjectId("a".repeat(24))
const projectB = ProjectId("b".repeat(24))

const makeMonitor = (id: string, projectId: ProjectId, name: string, overrides: Partial<Monitor> = {}): Monitor => ({
  id: MonitorId(id.padEnd(24, "0")),
  organizationId,
  projectId,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  description: "",
  system: false,
  alerts: [],
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
})

const run = (seed: readonly Monitor[], args: { readonly searchQuery?: string; readonly limit?: number }) => {
  const { repo } = createFakeMonitorRepository(seed)
  return Effect.runPromise(
    searchMonitorsUseCase(args).pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(MonitorRepository, repo), Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    ),
  )
}

describe("searchMonitorsUseCase", () => {
  const seed = [
    makeMonitor("m1", projectA, "Latency Spikes"),
    makeMonitor("m2", projectB, "Latency Budget", { mutedAt: new Date("2026-02-01T00:00:00.000Z") }),
    makeMonitor("m3", projectA, "Error Rate"),
  ]

  it("returns matching monitors across multiple projects in the org", async () => {
    const results = await run(seed, { searchQuery: "latency" })
    expect(results.map((r) => r.name).sort()).toEqual(["Latency Budget", "Latency Spikes"])
    expect(new Set(results.map((r) => r.projectId)).size).toBe(2)
  })

  it("carries project display fields and status", async () => {
    const results = await run(seed, { searchQuery: "budget" })
    expect(results).toHaveLength(1)
    expect(results[0]?.projectId).toBe(projectB)
    expect(results[0]?.projectSlug).toContain(projectB)
    expect(results[0]?.projectName).toContain(projectB)
    expect(results[0]?.mutedAt).not.toBeNull()
  })

  it("respects the limit", async () => {
    const results = await run(seed, { searchQuery: "latency", limit: 1 })
    expect(results).toHaveLength(1)
  })
})
