import { type AgentScoreSnapshot, AgentScoreSnapshotRepository } from "@domain/agent-score"
import { OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { agentScoreSnapshots } from "../schema/agent-score-snapshots.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AgentScoreSnapshotRepositoryLive } from "./agent-score-snapshot-repository.ts"

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const PROJECT_A = ProjectId("p".repeat(24))
const PROJECT_B = ProjectId("q".repeat(24))

const pg = setupTestPostgres()

const run = <A, E>(
  effect: Effect.Effect<A, E, AgentScoreSnapshotRepository | SqlClient>,
  org: OrganizationId = ORG_A,
) => Effect.runPromise(effect.pipe(withPostgres(AgentScoreSnapshotRepositoryLive, pg.adminPostgresClient, org)))

const dimension = (score: number) => ({ score, interval: { lower: score - 5, upper: score + 5 } })

const snapshot = (overrides: Partial<AgentScoreSnapshot> = {}): AgentScoreSnapshot => ({
  organizationId: ORG_A,
  projectId: PROJECT_A,
  date: "2026-09-29",
  scoringVersion: "agent-score-v1-provisional",
  windowDays: 7,
  eligibleSessionCount: 1_240,
  score: 69,
  interval: { lower: 66.6, upper: 71.4 },
  dimensions: {
    outcome: dimension(78),
    reliability: dimension(36),
    cost: dimension(84),
    speed: dimension(72),
    safety: dimension(90),
  },
  createdAt: new Date("2026-09-29T03:00:00.000Z"),
  ...overrides,
})

const insert = (value: AgentScoreSnapshot, org: OrganizationId = ORG_A) =>
  run(
    Effect.gen(function* () {
      const repository = yield* AgentScoreSnapshotRepository
      return yield* repository.insertIfAbsent(value)
    }),
    org,
  )

const find = (date: string, scope: { org?: OrganizationId; project?: ProjectId } = {}) =>
  run(
    Effect.gen(function* () {
      const repository = yield* AgentScoreSnapshotRepository
      return yield* repository.findByDate({
        organizationId: scope.org ?? ORG_A,
        projectId: scope.project ?? PROJECT_A,
        date,
      })
    }),
    scope.org ?? ORG_A,
  )

afterEach(async () => {
  await pg.db.delete(agentScoreSnapshots)
})

describe("AgentScoreSnapshotRepositoryLive", () => {
  it("round-trips every score and interval it stores", async () => {
    await insert(snapshot())
    const stored = await find("2026-09-29")

    expect(stored).toMatchObject({
      date: "2026-09-29",
      scoringVersion: "agent-score-v1-provisional",
      windowDays: 7,
      eligibleSessionCount: 1_240,
      score: 69,
      interval: { lower: 66.6, upper: 71.4 },
    })
    expect(stored?.dimensions.reliability).toEqual({ score: 36, interval: { lower: 31, upper: 41 } })
    expect(stored?.dimensions.safety?.score).toBe(90)
  })

  it("is a no-op on a date that already has a snapshot", async () => {
    expect(await insert(snapshot())).toBe(true)
    expect(await insert(snapshot({ score: 42 }))).toBe(false)

    // A stored score records what was published on a date; a rerun is not a correction.
    expect((await find("2026-09-29"))?.score).toBe(69)
  })

  it("keeps a policy cap and its absence apart", async () => {
    await insert(snapshot({ date: "2026-09-27" }))
    await insert(snapshot({ date: "2026-09-28", policyCap: 50 }))

    expect((await find("2026-09-27"))?.policyCap).toBeUndefined()
    expect((await find("2026-09-28"))?.policyCap).toBe(50)
  })

  it("returns nothing for a date that was never published", async () => {
    expect(await find("2026-01-01")).toBeNull()
  })

  it("returns history oldest first, inside the requested dates", async () => {
    for (const date of ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]) {
      await insert(snapshot({ date }))
    }

    const history = await run(
      Effect.gen(function* () {
        const repository = yield* AgentScoreSnapshotRepository
        return yield* repository.listHistory({
          organizationId: ORG_A,
          projectId: PROJECT_A,
          from: "2026-09-25",
          to: "2026-09-26",
        })
      }),
    )

    expect(history.map((entry) => entry.date)).toEqual(["2026-09-25", "2026-09-26"])
  })

  it("scopes reads to the organization and the project", async () => {
    await insert(snapshot())
    await insert(snapshot({ organizationId: ORG_B, projectId: PROJECT_B }), ORG_B)

    expect(await find("2026-09-29", { org: ORG_B, project: PROJECT_B })).not.toBeNull()
    expect(await find("2026-09-29", { org: ORG_A, project: PROJECT_B })).toBeNull()
  })

  it("lets two projects publish the same date", async () => {
    expect(await insert(snapshot())).toBe(true)
    expect(await insert(snapshot({ projectId: PROJECT_B }))).toBe(true)
  })
})
