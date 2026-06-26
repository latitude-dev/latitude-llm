import { OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid } from "../helpers.ts"
import {
  type OrgSignalSearchHit,
  SignalRepository,
  type SignalRepositoryShape,
  type SignalWithLifecycle,
} from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { searchOrgSignalsUseCase } from "./search-org-signals.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectA = ProjectId("a".repeat(24))
const projectB = ProjectId("b".repeat(24))

const makeSignal = (id: string, projectId: ProjectId, name: string, overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId(id.padEnd(24, "0")),
  organizationId: organizationId as string,
  projectId: projectId as string,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  description: "",
  source: "annotation",
  origin: "system",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  ...overrides,
})

const hit = (issue: Signal, score: number): OrgSignalSearchHit => ({
  issue: Object.assign({}, issue, { lifecycle: { isEscalating: false, isRegressed: false } }) as SignalWithLifecycle,
  projectSlug: `slug-${issue.projectId}`,
  projectName: `Project ${issue.projectId}`,
  score,
})

const run = (
  searchOrgWide: SignalRepositoryShape["searchOrgWide"],
  args: { readonly query: string; readonly normalizedEmbedding?: readonly number[]; readonly limit?: number },
) => {
  const { repository } = createFakeSignalRepository([], { searchOrgWide })
  return Effect.runPromise(
    searchOrgSignalsUseCase({ organizationId, ...args }).pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(SignalRepository, repository), Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    ),
  )
}

const lexA = makeSignal("ix1", projectA, "Payment Errors")
const lexB = makeSignal("ix2", projectB, "Error Rate", { resolvedAt: new Date("2026-03-02T00:00:00.000Z") })
const semC = makeSignal("ix3", projectA, "Latency")

describe("searchOrgSignalsUseCase", () => {
  it("returns lexical hits across projects with derived states when no embedding is passed", async () => {
    const searchOrgWide: SignalRepositoryShape["searchOrgWide"] = ({ limit }) =>
      Effect.sync(() => [hit(lexA, 0.9), hit(lexB, 0.8)].slice(0, limit))

    const results = await run(searchOrgWide, { query: "error" })

    expect(results.map((r) => r.id)).toEqual([lexA.id, lexB.id])
    expect(new Set(results.map((r) => r.projectId)).size).toBe(2)
    // lexB is resolved → its derived states include "resolved"
    expect(results.find((r) => r.id === lexB.id)?.states).toContain("resolved")
    expect(results[0]?.projectName).toContain(projectA)
    expect(results[0]?.projectSlug).toContain(projectA)
  })

  it("merges lexical-first, then de-duped semantic hits", async () => {
    const searchOrgWide: SignalRepositoryShape["searchOrgWide"] = ({ normalizedEmbedding, limit }) =>
      Effect.sync(
        () =>
          normalizedEmbedding === undefined
            ? [hit(lexA, 0.9), hit(lexB, 0.8)].slice(0, limit) // lexical tier
            : [hit(lexA, 0.7), hit(semC, 0.6)].slice(0, limit), // semantic tier (lexA overlaps)
      )

    const results = await run(searchOrgWide, { query: "error", normalizedEmbedding: [0.1, 0.2] })

    // lexical first (lexA, lexB), then semantic minus the duplicate lexA → semC appended
    expect(results.map((r) => r.id)).toEqual([lexA.id, lexB.id, semC.id])
  })

  it("caps the merged result at the limit", async () => {
    const searchOrgWide: SignalRepositoryShape["searchOrgWide"] = ({ normalizedEmbedding, limit }) =>
      Effect.sync(() =>
        normalizedEmbedding === undefined ? [hit(lexA, 0.9), hit(lexB, 0.8)].slice(0, limit) : [hit(semC, 0.6)],
      )

    const results = await run(searchOrgWide, { query: "error", normalizedEmbedding: [0.1, 0.2], limit: 2 })

    expect(results).toHaveLength(2)
    expect(results.map((r) => r.id)).toEqual([lexA.id, lexB.id])
  })
})
