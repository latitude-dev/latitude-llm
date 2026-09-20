import { OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AgentScoreSnapshot } from "../entities/agent-score-snapshot.ts"
import {
  AgentScoreSnapshotRepository,
  type AgentScoreSnapshotRepositoryShape,
} from "../ports/agent-score-snapshot-repository.ts"
import { getAgentScoreForDate, getLatestAgentScore } from "./get-agent-score.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))

const snapshot = (date: string, score: number): AgentScoreSnapshot => ({
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  date,
  scoringVersion: "agent-score-v1-provisional",
  windowDays: 7,
  eligibleSessionCount: 100,
  score,
  interval: { lower: score, upper: score },
  dimensions: {
    outcome: { score, interval: { lower: score, upper: score } },
    reliability: { score, interval: { lower: score, upper: score } },
    cost: { score, interval: { lower: score, upper: score } },
    speed: { score, interval: { lower: score, upper: score } },
    safety: { score, interval: { lower: score, upper: score } },
  },
  createdAt: new Date(`${date}T03:00:00.000Z`),
})

const repository = (snapshots: readonly AgentScoreSnapshot[]): AgentScoreSnapshotRepositoryShape => ({
  insertIfAbsent: () => Effect.succeed(false),
  findByDate: ({ organizationId, projectId, date }) =>
    Effect.succeed(
      snapshots.find(
        (entry) => entry.organizationId === organizationId && entry.projectId === projectId && entry.date === date,
      ) ?? null,
    ),
  findLatest: ({ organizationId, projectId, throughDate }) =>
    Effect.succeed(
      snapshots
        .filter(
          (entry) =>
            entry.organizationId === organizationId && entry.projectId === projectId && entry.date <= throughDate,
        )
        .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null,
    ),
  listHistory: ({ organizationId, projectId, from, to }) =>
    Effect.succeed(
      snapshots.filter(
        (entry) =>
          entry.organizationId === organizationId &&
          entry.projectId === projectId &&
          entry.date >= from &&
          entry.date <= to,
      ),
    ),
})

const readLatest = (snapshots: readonly AgentScoreSnapshot[], now = new Date("2026-09-29T12:00:00.000Z")) =>
  Effect.runPromise(
    getLatestAgentScore({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, now }).pipe(
      Effect.provide(Layer.succeed(AgentScoreSnapshotRepository, repository(snapshots))),
      Effect.provideService(SqlClient, {} as SqlClientShape),
    ),
  )

describe("getLatestAgentScore", () => {
  it("returns an explicit absence when no snapshot exists", async () => {
    await expect(readLatest([])).resolves.toEqual({ available: false, date: "2026-09-29" })
  })

  it("returns the latest snapshot through today while retaining today's date", async () => {
    const result = await readLatest([snapshot("2026-06-01", 40), snapshot("2026-09-28", 70)])

    expect(result).toMatchObject({
      available: true,
      date: "2026-09-29",
      snapshot: { date: "2026-09-28", score: 70 },
    })
  })

  it("does not use a future snapshot", async () => {
    const result = await readLatest([snapshot("2026-09-28", 70), snapshot("2026-09-30", 90)])

    expect(result).toMatchObject({ available: true, snapshot: { date: "2026-09-28", score: 70 } })
  })
})

const readDate = (snapshots: readonly AgentScoreSnapshot[], date?: string) =>
  Effect.runPromise(
    getAgentScoreForDate({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      date,
      now: new Date("2026-09-29T12:00:00.000Z"),
    }).pipe(
      Effect.provide(Layer.succeed(AgentScoreSnapshotRepository, repository(snapshots))),
      Effect.provideService(SqlClient, {} as SqlClientShape),
    ),
  )

describe("getAgentScoreForDate", () => {
  it("defaults to the latest published date even outside the history range", async () => {
    await expect(readDate([snapshot("2026-01-01", 40)])).resolves.toMatchObject({
      date: "2026-01-01",
      snapshot: { date: "2026-01-01", score: 40 },
    })
  })

  it("defaults to today if no score has been published", async () => {
    await expect(readDate([])).resolves.toEqual({ available: false, date: "2026-09-29" })
  })

  it("does not fill an unscored selected day with an older score", async () => {
    await expect(readDate([snapshot("2026-09-28", 70)], "2026-09-29")).resolves.toEqual({
      available: false,
      date: "2026-09-29",
    })
  })

  it("selects the exact historical day instead of the latest score", async () => {
    await expect(
      readDate([snapshot("2026-09-26", 40), snapshot("2026-09-28", 70)], "2026-09-26"),
    ).resolves.toMatchObject({ date: "2026-09-26", snapshot: { date: "2026-09-26", score: 40 } })
  })
})
