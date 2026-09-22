import { AdminAgentScoreHistoryRepository } from "@domain/admin"
import { type AgentScoreSnapshot, AgentScoreSnapshotRepository } from "@domain/agent-score"
import { OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { agentScoreSnapshots } from "../schema/agent-score-snapshots.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AdminAgentScoreHistoryRepositoryLive } from "./admin-agent-score-history-repository.ts"
import { AgentScoreSnapshotRepositoryLive } from "./agent-score-snapshot-repository.ts"

const ORG = OrganizationId("a".repeat(24))
const PROJECT = ProjectId("p".repeat(24))

const pg = setupTestPostgres()

const layers = Layer.mergeAll(AdminAgentScoreHistoryRepositoryLive, AgentScoreSnapshotRepositoryLive)

/**
 * Drives the adapter exactly as the backoffice wires it: the admin pool, and the `"system"` scope
 * that bypasses RLS. That scope is the whole reason this adapter exists, so a test that passed a
 * real organization here would be testing a wiring production never uses.
 */
const runAsAdmin = <A, E>(
  effect: Effect.Effect<A, E, AdminAgentScoreHistoryRepository | AgentScoreSnapshotRepository | SqlClient>,
) => Effect.runPromise(effect.pipe(withPostgres(layers, pg.adminPostgresClient)))

const dimension = (score: number) => ({ score, interval: { lower: score - 5, upper: score + 5 } })

const snapshot = (date: string, score: number, overrides: Partial<AgentScoreSnapshot> = {}): AgentScoreSnapshot => ({
  organizationId: ORG,
  projectId: PROJECT,
  date,
  scoringVersion: "agent-score-v6-provisional",
  windowDays: 14,
  eligibleSessionCount: 1_240,
  score,
  interval: { lower: score - 4, upper: score + 4 },
  dimensions: {
    outcome: dimension(score),
    reliability: dimension(score),
    cost: dimension(score),
    speed: dimension(score),
    safety: dimension(score),
  },
  createdAt: new Date("2026-09-29T03:00:00.000Z"),
  ...overrides,
})

const seed = (snapshots: readonly AgentScoreSnapshot[]) =>
  runAsAdmin(
    Effect.gen(function* () {
      const repository = yield* AdminAgentScoreHistoryRepository
      return yield* repository.insertSnapshotsIfAbsent(snapshots)
    }),
  )

const readHistory = () =>
  runAsAdmin(
    Effect.gen(function* () {
      const repository = yield* AgentScoreSnapshotRepository
      return yield* repository.listHistory({
        organizationId: ORG,
        projectId: PROJECT,
        from: "2026-09-01",
        to: "2026-09-30",
      })
    }),
  )

afterEach(async () => {
  await pg.db.delete(agentScoreSnapshots)
})

describe("AdminAgentScoreHistoryRepositoryLive", () => {
  it("files seeded snapshots under the target organization, not the admin connection's scope", async () => {
    const written = await seed([snapshot("2026-09-10", 61), snapshot("2026-09-11", 63.5)])

    expect(written).toBe(2)
    const rows = await pg.db.select().from(agentScoreSnapshots)
    // The bug this guards: the tenant-facing writer overrides `organization_id` with the connection
    // scope, which is `"system"` here — those rows would be invisible to the project that asked.
    expect(rows.map((row) => row.organizationId)).toEqual([ORG, ORG])
    expect(rows.every((row) => row.projectId === PROJECT)).toBe(true)
  })

  it("is readable through the tenant-facing repository afterwards", async () => {
    await seed([snapshot("2026-09-10", 61), snapshot("2026-09-12", 66)])

    const history = await readHistory()

    expect(history.map((entry) => entry.date)).toEqual(["2026-09-10", "2026-09-12"])
    expect(history.map((entry) => entry.score)).toEqual([61, 66])
  })

  it("leaves a date that already carries a score exactly as it was", async () => {
    await seed([snapshot("2026-09-10", 61)])

    const written = await seed([snapshot("2026-09-10", 99), snapshot("2026-09-11", 64)])

    expect(written).toBe(1)
    const history = await readHistory()
    expect(history.map((entry) => [entry.date, entry.score])).toEqual([
      ["2026-09-10", 61],
      ["2026-09-11", 64],
    ])
  })

  it("re-seeding the same range writes nothing the second time", async () => {
    const range = [snapshot("2026-09-10", 61), snapshot("2026-09-11", 63), snapshot("2026-09-12", 65)]

    expect(await seed(range)).toBe(3)
    expect(await seed(range)).toBe(0)
    expect(await readHistory()).toHaveLength(3)
  })

  it("writes nothing, and touches no connection, for an empty range", async () => {
    expect(await seed([])).toBe(0)
    expect(await readHistory()).toEqual([])
  })
})
