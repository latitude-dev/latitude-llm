import { type AgentScoreSnapshot, AgentScoreSnapshotRepository, LAUNCH_SCORING_VERSION } from "@domain/agent-score"
import { OrganizationId, ProjectId, SCORE_DIMENSIONS, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AdminAgentScoreHistoryRepository } from "./agent-score-history-repository.ts"
import { SEED_AGENT_SCORE_HISTORY_DAYS, seedAgentScoreHistoryUseCase, seedableDateRange } from "./seed-agent-score-history.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const NOW = new Date("2026-09-18T09:00:00.000Z")

const publishedSnapshot: AgentScoreSnapshot = {
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  date: "2026-09-17",
  scoringVersion: LAUNCH_SCORING_VERSION,
  windowDays: 21,
  eligibleSessionCount: 4_812,
  score: 74.4,
  interval: { lower: 70, upper: 78 },
  dimensions: Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [dimension, { score: 74.4, interval: { lower: 70, upper: 78 } }]),
  ) as AgentScoreSnapshot["dimensions"],
  createdAt: new Date("2026-09-17T04:05:00.000Z"),
}

const historyPort = (takenDates: readonly string[] = []) => {
  const written: AgentScoreSnapshot[] = []
  const layer = Layer.succeed(AdminAgentScoreHistoryRepository, {
    insertSnapshotsIfAbsent: (snapshots) => {
      const landed = snapshots.filter((snapshot) => !takenDates.includes(snapshot.date))
      written.push(...landed)
      return Effect.succeed(landed.length)
    },
  })
  return { layer, written }
}

const snapshotPort = (latest: AgentScoreSnapshot | null) =>
  Layer.succeed(AgentScoreSnapshotRepository, {
    insertIfAbsent: () => Effect.succeed(false),
    findByDate: () => Effect.succeed(null),
    findLatest: () => Effect.succeed(latest),
    listHistory: () => Effect.succeed([]),
  })

const seed = ({
  days,
  latest,
  takenDates,
}: {
  readonly days: readonly { readonly date: string; readonly score: number }[]
  readonly latest?: AgentScoreSnapshot | null
  readonly takenDates?: readonly string[]
}) => {
  const history = historyPort(takenDates)
  return Effect.runPromise(
    seedAgentScoreHistoryUseCase({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      days,
      now: NOW,
    }).pipe(
      Effect.provide(Layer.mergeAll(history.layer, snapshotPort(latest ?? null))),
      // The fakes never reach the database; the ports declare the dependency, so it has to exist.
      Effect.provideService(SqlClient, {} as SqlClientShape),
    ),
  ).then((result) => ({ result, written: history.written }))
}

const seedError = (days: readonly { readonly date: string; readonly score: number }[]) =>
  Effect.runPromise(
    Effect.flip(
      seedAgentScoreHistoryUseCase({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        days,
        now: NOW,
      }).pipe(
        Effect.provide(Layer.mergeAll(historyPort().layer, snapshotPort(null))),
        Effect.provideService(SqlClient, {} as SqlClientShape),
      ),
    ),
  )

describe("seedAgentScoreHistoryUseCase", () => {
  it("writes one snapshot per requested day under the target organization", async () => {
    const { result, written } = await seed({
      days: [
        { date: "2026-09-16", score: 70.2 },
        { date: "2026-09-18", score: 75.9 },
      ],
    })

    expect(result).toEqual({ requested: 2, written: 2, skipped: 0 })
    expect(written.map((snapshot) => snapshot.date)).toEqual(["2026-09-16", "2026-09-18"])
    expect(written.map((snapshot) => snapshot.score)).toEqual([70.2, 75.9])
    expect(written.every((snapshot) => snapshot.organizationId === ORGANIZATION_ID)).toBe(true)
    expect(written.every((snapshot) => snapshot.projectId === PROJECT_ID)).toBe(true)
  })

  it("publishes under the live scoring version so the trend reads as one measurement", async () => {
    const { written } = await seed({ days: [{ date: "2026-09-16", score: 70 }] })

    expect(written[0]?.scoringVersion).toBe(LAUNCH_SCORING_VERSION)
  })

  it("copies the window and session count from the project's own latest score", async () => {
    const { written } = await seed({ days: [{ date: "2026-09-16", score: 70 }], latest: publishedSnapshot })

    expect(written[0]?.windowDays).toBe(21)
    expect(written[0]?.eligibleSessionCount).toBe(4_812)
  })

  it("falls back to the shortest window when the project has never published", async () => {
    const { written } = await seed({ days: [{ date: "2026-09-16", score: 70 }], latest: null })

    // The shortest step is the one tomorrow's hysteresis ignores on a quiet project.
    expect(written[0]?.windowDays).toBe(7)
  })

  it("reports days the repository refused because a real score already holds them", async () => {
    const { result, written } = await seed({
      days: [
        { date: "2026-09-16", score: 70 },
        { date: "2026-09-17", score: 71 },
        { date: "2026-09-18", score: 72 },
      ],
      takenDates: ["2026-09-17"],
    })

    expect(result).toEqual({ requested: 3, written: 2, skipped: 1 })
    expect(written.map((snapshot) => snapshot.date)).toEqual(["2026-09-16", "2026-09-18"])
  })

  it("does not read the project's latest score when there is nothing to write", async () => {
    const { result, written } = await seed({ days: [] })

    expect(result).toEqual({ requested: 0, written: 0, skipped: 0 })
    expect(written).toEqual([])
  })
})

describe("seedableDateRange", () => {
  it("is the advertised window, inclusive of today", () => {
    expect(seedableDateRange(NOW)).toEqual({ from: "2026-08-20", to: "2026-09-18" })
    expect(SEED_AGENT_SCORE_HISTORY_DAYS).toBe(30)
  })
})

describe("seedAgentScoreHistoryUseCase date bounds", () => {
  it("refuses a future date, which would block the real job from ever scoring that day", async () => {
    // Seeding and the daily job share insert-if-absent on (org, project, date): a row placed ahead
    // of today makes the real run a silent no-op when the date arrives.
    const error = await seedError([{ date: "2026-09-19", score: 70 }])

    expect(error._tag).toBe("ValidationError")
    expect(error.message).toContain("2026-09-19")
  })

  it("refuses a date older than the window the action advertises", async () => {
    const error = await seedError([{ date: "2026-08-19", score: 70 }])

    expect(error._tag).toBe("ValidationError")
    expect(error.message).toContain("2026-08-19")
  })

  it("refuses a date that is well formed but not a real day", async () => {
    const error = await seedError([{ date: "2026-02-30", score: 70 }])

    expect(error._tag).toBe("ValidationError")
  })

  it("refuses the whole batch rather than silently dropping the bad days", async () => {
    const { written } = historyPort()
    const error = await seedError([
      { date: "2026-09-17", score: 70 },
      { date: "2026-12-01", score: 70 },
    ])

    expect(error._tag).toBe("ValidationError")
    expect(written).toEqual([])
  })

  it("accepts both ends of the window", async () => {
    const { result } = await seed({
      days: [
        { date: "2026-08-20", score: 61 },
        { date: "2026-09-18", score: 80 },
      ],
    })

    expect(result).toEqual({ requested: 2, written: 2, skipped: 0 })
  })
})
