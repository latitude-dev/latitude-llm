import { type AgentScoreSnapshot, AgentScoreSnapshotRepository, LAUNCH_SCORING_VERSION } from "@domain/agent-score"
import { OrganizationId, ProjectId, SCORE_DIMENSIONS, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AdminAgentScoreHistoryRepository } from "./agent-score-history-repository.ts"
import { seedAgentScoreHistoryUseCase } from "./seed-agent-score-history.ts"

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

/** Captures what the use case would write, and reports a caller-chosen number of dates as taken. */
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
