import { type AdminFeatureFlagEligibility, AdminFeatureFlagRepository } from "@domain/admin"
import { type AgentScoreDigestCandidate, type AgentScoreDigestScope, AgentScoreDigestSource } from "@domain/agent-score"
import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type AgentScoreDigestPublish, fanOutAgentScoreDigest } from "./agent-score-digest-fan-out.ts"

const makeId = (prefix: string) => prefix.padEnd(24, "x").slice(0, 24)

const ORG_A = OrganizationId(makeId("org-a"))
const ORG_B = OrganizationId(makeId("org-b"))
const PROJECT_A = ProjectId(makeId("proj-a"))
const PROJECT_B = ProjectId(makeId("proj-b"))

const WINDOW = { windowStart: "2026-09-16", windowEnd: "2026-09-22" }

const candidate = (organizationId: OrganizationId, projectId: ProjectId): AgentScoreDigestCandidate => ({
  organizationId,
  projectId,
  latestDate: "2026-09-21",
})

interface Harness {
  readonly published: Array<Record<string, string>>
  readonly scopes: AgentScoreDigestScope[]
  readonly publish: AgentScoreDigestPublish
  readonly layer: Layer.Layer<AdminFeatureFlagRepository | AgentScoreDigestSource | SqlClient>
}

const harness = (options: {
  readonly eligibility: AdminFeatureFlagEligibility
  readonly candidates?: readonly AgentScoreDigestCandidate[]
}): Harness => {
  const published: Array<Record<string, string>> = []
  const scopes: AgentScoreDigestScope[] = []

  return {
    published,
    scopes,
    publish: (payload) =>
      Effect.sync(() => {
        published.push({ ...payload })
      }),
    layer: Layer.mergeAll(
      Layer.succeed(AdminFeatureFlagRepository, {
        list: () => Effect.die("not used"),
        findEligibilityForFlag: () => Effect.succeed(options.eligibility),
        enableForAll: () => Effect.die("not used"),
        disableForAll: () => Effect.die("not used"),
        listForOrganization: () => Effect.die("not used"),
        enableForOrganization: () => Effect.die("not used"),
        disableForOrganization: () => Effect.die("not used"),
      }),
      Layer.succeed(AgentScoreDigestSource, {
        listProjectsWithPublishedScores: (scope) =>
          Effect.sync(() => {
            scopes.push(scope)
            return options.candidates ?? []
          }),
      }),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId("system") })),
    ),
  }
}

const run = (h: Harness) =>
  Effect.runPromise(fanOutAgentScoreDigest({ publish: h.publish })(WINDOW).pipe(Effect.provide(h.layer)))

describe("fanOutAgentScoreDigest", () => {
  it("does not touch the database when the flag is enabled nowhere", async () => {
    const h = harness({ eligibility: { enabledForAll: false, organizationIds: [] } })

    expect(await run(h)).toEqual({ status: "no-eligible-organizations" })
    expect(h.scopes).toHaveLength(0)
    expect(h.published).toHaveLength(0)
  })

  it("passes no organization filter when the flag is enabled for all", async () => {
    const h = harness({
      eligibility: { enabledForAll: true, organizationIds: [] },
      candidates: [candidate(ORG_A, PROJECT_A)],
    })

    await run(h)

    expect(h.scopes[0]?.organizationIds).toBeUndefined()
    expect(h.scopes[0]).toMatchObject({ from: "2026-09-16", to: "2026-09-22" })
  })

  it("passes the enabled organizations through as a filter", async () => {
    const h = harness({
      eligibility: { enabledForAll: false, organizationIds: [ORG_A, ORG_B] },
      candidates: [candidate(ORG_A, PROJECT_A)],
    })

    await run(h)

    expect(h.scopes[0]?.organizationIds).toEqual([ORG_A, ORG_B])
  })

  it("reports no scored projects when an eligible fleet published nothing", async () => {
    const h = harness({ eligibility: { enabledForAll: true, organizationIds: [] }, candidates: [] })

    expect(await run(h)).toEqual({ status: "no-scored-projects" })
    expect(h.published).toHaveLength(0)
  })

  it("publishes one task per scored project, all carrying the same window", async () => {
    const h = harness({
      eligibility: { enabledForAll: true, organizationIds: [] },
      candidates: [candidate(ORG_A, PROJECT_A), candidate(ORG_B, PROJECT_B)],
    })

    expect(await run(h)).toEqual({ status: "fanned-out", publishedCount: 2 })
    expect(h.published).toEqual([
      { organizationId: ORG_A, projectId: PROJECT_A, ...WINDOW },
      { organizationId: ORG_B, projectId: PROJECT_B, ...WINDOW },
    ])
  })
})
