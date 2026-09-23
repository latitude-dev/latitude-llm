import { type AdminFeatureFlagEligibility, AdminFeatureFlagRepository } from "@domain/admin"
import { type AgentScoreDigestCandidate, type AgentScoreDigestScope, AgentScoreDigestSource } from "@domain/agent-score"
import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { ensureManualDigestEligible, isDigestEligible } from "./agent-score-digest.ts"

const ORG = "org-a".padEnd(24, "x")
const OTHER = "org-b".padEnd(24, "x")
const PROJECT = "proj-a".padEnd(24, "x")
const WINDOW = { from: "2026-09-17", to: "2026-09-23" }

describe("isDigestEligible", () => {
  it("admits every organization when the flag is enabled for all", () => {
    expect(isDigestEligible({ enabledForAll: true, organizationIds: [] }, ORG)).toBe(true)
  })

  it("admits an organization on the enabled list", () => {
    expect(isDigestEligible({ enabledForAll: false, organizationIds: [OrganizationId(ORG)] }, ORG)).toBe(true)
  })

  it("refuses an organization that is not on the list", () => {
    expect(isDigestEligible({ enabledForAll: false, organizationIds: [OrganizationId(OTHER)] }, ORG)).toBe(false)
  })

  it("refuses when the flag is enabled nowhere", () => {
    expect(isDigestEligible({ enabledForAll: false, organizationIds: [] }, ORG)).toBe(false)
  })
})

describe("ensureManualDigestEligible", () => {
  const harness = (options: {
    readonly eligibility?: AdminFeatureFlagEligibility
    readonly candidates?: readonly AgentScoreDigestCandidate[]
  }) => {
    const scopes: AgentScoreDigestScope[] = []
    const layer = Layer.mergeAll(
      Layer.succeed(AdminFeatureFlagRepository, {
        list: () => Effect.die("not used"),
        findEligibilityForFlag: () =>
          Effect.succeed(options.eligibility ?? { enabledForAll: true, organizationIds: [] }),
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
    )
    const run = () =>
      Effect.runPromise(
        Effect.result(
          ensureManualDigestEligible({
            organization: { id: ORG, name: "Acme Inc." },
            project: { id: PROJECT, name: "Support Agent" },
            window: WINDOW,
          }).pipe(Effect.provide(layer)),
        ),
      )
    return { run, scopes }
  }

  const candidate = (projectId: string): AgentScoreDigestCandidate => ({
    organizationId: OrganizationId(ORG),
    projectId: ProjectId(projectId),
    latestDate: "2026-09-22",
  })

  it("passes a project the weekly job would send to", async () => {
    const { run } = harness({ candidates: [candidate(PROJECT)] })

    expect((await run())._tag).toBe("Success")
  })

  it("refuses a project the weekly job would skip, such as a sample or showcase project", async () => {
    const { run } = harness({ candidates: [candidate("proj-other".padEnd(24, "x"))] })

    const result = await run()
    expect(result._tag).toBe("Failure")
    if (result._tag !== "Failure") throw new Error("unreachable")
    expect(result.failure.message).toContain("Support Agent would not get a digest this week")
  })

  it("asks the weekly job's own source, scoped to the project's organization and today's window", async () => {
    const { run, scopes } = harness({ candidates: [candidate(PROJECT)] })

    await run()
    expect(scopes).toEqual([{ ...WINDOW, organizationIds: [OrganizationId(ORG)] }])
  })

  it("refuses an organization without the flag before reading any project", async () => {
    const { run, scopes } = harness({
      eligibility: { enabledForAll: false, organizationIds: [] },
      candidates: [candidate(PROJECT)],
    })

    const result = await run()
    expect(result._tag).toBe("Failure")
    if (result._tag !== "Failure") throw new Error("unreachable")
    expect(result.failure.message).toContain("does not have the Agent Score feature flag enabled")
    expect(scopes).toHaveLength(0)
  })
})
