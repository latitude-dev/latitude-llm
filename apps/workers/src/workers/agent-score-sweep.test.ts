import { ScoreProjectSweepSource } from "@domain/agent-score"
import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { fanOutAgentScoreSweep } from "./agent-score-sweep.ts"

const ORG = OrganizationId("o".repeat(24))
const PROJECT = ProjectId("p".repeat(24))
const TO = new Date("2026-09-29T04:00:00.000Z")

const run = (
  projects: readonly { organizationId: OrganizationId; projectId: ProjectId; eligibleSessions: number }[],
) => {
  const published: { organizationId: string; projectId: string; date: string; to: string }[] = []
  const scopes: { sessionFloor: number; maxStepDays: number }[] = []

  const layer = Layer.mergeAll(
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId("system") })),
    Layer.succeed(ScoreProjectSweepSource, {
      listProjects: (scope) => {
        scopes.push({ sessionFloor: scope.sessionFloor, maxStepDays: scope.maxStepDays })
        return Effect.succeed(projects)
      },
    }),
  )

  return Effect.runPromise(
    fanOutAgentScoreSweep({
      publish: (payload) =>
        Effect.sync(() => {
          published.push(payload)
        }),
    })({ date: "2026-09-29", to: TO, maxStepDays: 28, sessionFloor: 200 }).pipe(Effect.provide(layer)),
  ).then((result) => ({ result, published, scopes }))
}

describe("fanOutAgentScoreSweep", () => {
  it("publishes one task per project, carrying both identities", async () => {
    const { result, published } = await run([
      { organizationId: ORG, projectId: PROJECT, eligibleSessions: 900 },
      { organizationId: ORG, projectId: ProjectId("q".repeat(24)), eligibleSessions: 400 },
    ])

    expect(result).toEqual({ status: "fanned-out", publishedCount: 2 })
    expect(published).toHaveLength(2)
    expect(published[0]).toMatchObject({ organizationId: ORG, projectId: PROJECT, date: "2026-09-29" })
  })

  it("stamps every payload with one date, so a slow fan-out cannot straddle midnight", async () => {
    const { published } = await run([
      { organizationId: ORG, projectId: PROJECT, eligibleSessions: 900 },
      { organizationId: ORG, projectId: ProjectId("q".repeat(24)), eligibleSessions: 400 },
    ])

    expect(new Set(published.map((payload) => payload.date))).toEqual(new Set(["2026-09-29"]))
  })

  it("carries the instant the eligibility read ended, so scoring cannot use a different window", async () => {
    const { published } = await run([
      { organizationId: ORG, projectId: PROJECT, eligibleSessions: 900 },
      { organizationId: ORG, projectId: ProjectId("q".repeat(24)), eligibleSessions: 400 },
    ])

    expect(new Set(published.map((payload) => payload.to))).toEqual(new Set([TO.toISOString()]))
  })

  it("asks only for projects that could publish under some window", async () => {
    const { scopes } = await run([])

    expect(scopes[0]).toEqual({ sessionFloor: 200, maxStepDays: 28 })
  })

  it("publishes nothing when no project reached the floor", async () => {
    const { result, published } = await run([])

    expect(result).toEqual({ status: "no-eligible-projects" })
    expect(published).toEqual([])
  })
})
