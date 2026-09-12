import { type AgentScoreSnapshot, AgentScoreSnapshotRepository, type DimensionSnapshot } from "@domain/agent-score"
import { SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, asc, between, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentScoreSnapshots } from "../schema/agent-score-snapshots.ts"

type Row = typeof agentScoreSnapshots.$inferSelect

const dimension = (score: number, lower: number, upper: number): DimensionSnapshot => ({
  score,
  interval: { lower, upper },
})

const toDomain = (row: Row): AgentScoreSnapshot => ({
  organizationId: row.organizationId,
  projectId: row.projectId,
  date: row.date,
  scoringVersion: row.scoringVersion,
  windowDays: row.windowDays,
  eligibleSessionCount: row.eligibleSessionCount,
  score: row.score,
  interval: { lower: row.scoreLower, upper: row.scoreUpper },
  dimensions: {
    outcome: dimension(row.outcome, row.outcomeLower, row.outcomeUpper),
    reliability: dimension(row.reliability, row.reliabilityLower, row.reliabilityUpper),
    cost: dimension(row.cost, row.costLower, row.costUpper),
    speed: dimension(row.speed, row.speedLower, row.speedUpper),
    safety: dimension(row.safety, row.safetyLower, row.safetyUpper),
  },
  ...(row.policyCap === null ? {} : { policyCap: row.policyCap }),
  createdAt: row.createdAt,
})

const toInsertRow = (snapshot: AgentScoreSnapshot) => ({
  organizationId: snapshot.organizationId,
  projectId: snapshot.projectId,
  date: snapshot.date,
  scoringVersion: snapshot.scoringVersion,
  windowDays: snapshot.windowDays,
  eligibleSessionCount: snapshot.eligibleSessionCount,
  score: snapshot.score,
  scoreLower: snapshot.interval.lower,
  scoreUpper: snapshot.interval.upper,
  outcome: snapshot.dimensions.outcome.score,
  outcomeLower: snapshot.dimensions.outcome.interval.lower,
  outcomeUpper: snapshot.dimensions.outcome.interval.upper,
  reliability: snapshot.dimensions.reliability.score,
  reliabilityLower: snapshot.dimensions.reliability.interval.lower,
  reliabilityUpper: snapshot.dimensions.reliability.interval.upper,
  cost: snapshot.dimensions.cost.score,
  costLower: snapshot.dimensions.cost.interval.lower,
  costUpper: snapshot.dimensions.cost.interval.upper,
  speed: snapshot.dimensions.speed.score,
  speedLower: snapshot.dimensions.speed.interval.lower,
  speedUpper: snapshot.dimensions.speed.interval.upper,
  safety: snapshot.dimensions.safety.score,
  safetyLower: snapshot.dimensions.safety.interval.lower,
  safetyUpper: snapshot.dimensions.safety.interval.upper,
  policyCap: snapshot.policyCap ?? null,
  createdAt: snapshot.createdAt,
})

export const AgentScoreSnapshotRepositoryLive = Layer.succeed(AgentScoreSnapshotRepository, {
  insertIfAbsent: (snapshot) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      // `doNothing` on the unique key rather than a read-then-write: two workers racing the same
      // date must not both decide the row is absent, and a stored score is never corrected anyway.
      const inserted = yield* sqlClient.query((db) =>
        db
          .insert(agentScoreSnapshots)
          .values(toInsertRow(snapshot))
          .onConflictDoNothing({
            target: [agentScoreSnapshots.organizationId, agentScoreSnapshots.projectId, agentScoreSnapshots.date],
          })
          .returning({ id: agentScoreSnapshots.id }),
      )
      return inserted.length > 0
    }).pipe(Effect.mapError((error) => toRepositoryError(error, "AgentScoreSnapshotRepository.insertIfAbsent"))),

  findByDate: ({ organizationId, projectId, date }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [row] = yield* sqlClient.query((db) =>
        db
          .select()
          .from(agentScoreSnapshots)
          .where(
            and(
              eq(agentScoreSnapshots.organizationId, organizationId),
              eq(agentScoreSnapshots.projectId, projectId),
              eq(agentScoreSnapshots.date, date),
            ),
          )
          .limit(1),
      )
      return row ? toDomain(row) : null
    }).pipe(Effect.mapError((error) => toRepositoryError(error, "AgentScoreSnapshotRepository.findByDate"))),

  listHistory: ({ organizationId, projectId, from, to }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient.query((db) =>
        db
          .select()
          .from(agentScoreSnapshots)
          .where(
            and(
              eq(agentScoreSnapshots.organizationId, organizationId),
              eq(agentScoreSnapshots.projectId, projectId),
              between(agentScoreSnapshots.date, from, to),
            ),
          )
          .orderBy(asc(agentScoreSnapshots.date)),
      )
      return rows.map(toDomain)
    }).pipe(Effect.mapError((error) => toRepositoryError(error, "AgentScoreSnapshotRepository.listHistory"))),
})
