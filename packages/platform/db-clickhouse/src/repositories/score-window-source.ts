import type { ClickHouseClient } from "@clickhouse/client"
import {
  ScoreProjectSweepSource,
  type ScoreSweepProject,
  ScoreWindowSource,
  type ScoreWindowStepCount,
} from "@domain/agent-score"
import { FLAGGER_NO_REFLAG_TAG } from "@domain/flaggers"
import {
  ChSqlClient,
  type ChSqlClientShape,
  OrganizationId,
  ProjectId,
  SessionId,
  toRepositoryError,
} from "@domain/shared"
import { formatCHDate, normalizeCHString } from "@repo/utils"
import { Effect, Layer } from "effect"
import {
  ELIGIBLE_PROJECTS_QUERY,
  ELIGIBLE_SESSION_AGE_HISTOGRAM_QUERY,
  ELIGIBLE_SESSION_IDS_QUERY,
  SESSION_END_DEBOUNCE_SECONDS,
} from "./eligible-sessions.ts"

interface AgeRow {
  readonly age_days: string | number
  readonly eligible_sessions: string | number
}

interface SessionIdRow {
  readonly session_id: string
}

interface ProjectRow {
  readonly organization_id: string
  readonly project_id: string
  readonly eligible_sessions: string | number
}

const daysBefore = (to: Date, days: number): Date => new Date(to.getTime() - days * 24 * 60 * 60 * 1000)

/**
 * Folds the age histogram into one count per candidate step.
 *
 * A session in the seven-day window is also in the fourteen, so each step counts every bucket below
 * its own length rather than owning one. Steps the source was not asked about are absent rather than
 * zero: zero is a real answer and "not asked" is not.
 */
const countsByStep = ({
  rows,
  stepDays,
}: {
  readonly rows: readonly AgeRow[]
  readonly stepDays: readonly number[]
}): ScoreWindowStepCount[] =>
  stepDays.map((days) => ({
    stepDays: days,
    eligibleSessions: rows.reduce(
      (total, row) => (Number(row.age_days) < days ? total + Number(row.eligible_sessions) : total),
      0,
    ),
  }))

export const ScoreWindowSourceLive = Layer.succeed(ScoreWindowSource, {
  readEligibleCounts: ({ organizationId, projectId, to, stepDays }) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const longestStep = Math.max(...stepDays, 0)
      if (longestStep === 0) return []

      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: ELIGIBLE_SESSION_AGE_HISTOGRAM_QUERY,
            query_params: {
              organizationId: organizationId as string,
              projectId: projectId as string,
              from: formatCHDate(daysBefore(to, longestStep)),
              to: formatCHDate(to),
              debounceSeconds: SESSION_END_DEBOUNCE_SECONDS,
              noReflagTag: FLAGGER_NO_REFLAG_TAG,
            },
            format: "JSONEachRow",
          })
          return countsByStep({ rows: await result.json<AgeRow>(), stepDays })
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "ScoreWindowSource.readEligibleCounts")))
    }),

  readEligibleSessionIds: ({ organizationId, projectId, from, to }) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: ELIGIBLE_SESSION_IDS_QUERY,
            query_params: {
              organizationId: organizationId as string,
              projectId: projectId as string,
              from: formatCHDate(from),
              to: formatCHDate(to),
              debounceSeconds: SESSION_END_DEBOUNCE_SECONDS,
              noReflagTag: FLAGGER_NO_REFLAG_TAG,
            },
            format: "JSONEachRow",
          })
          const rows = await result.json<SessionIdRow>()
          return rows.map((row) => SessionId(normalizeCHString(row.session_id)))
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "ScoreWindowSource.readEligibleSessionIds")))
    }),
})

export const ScoreProjectSweepSourceLive = Layer.succeed(ScoreProjectSweepSource, {
  listProjects: ({ to, maxStepDays, sessionFloor }) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: ELIGIBLE_PROJECTS_QUERY,
            query_params: {
              from: formatCHDate(daysBefore(to, maxStepDays)),
              to: formatCHDate(to),
              debounceSeconds: SESSION_END_DEBOUNCE_SECONDS,
              noReflagTag: FLAGGER_NO_REFLAG_TAG,
              sessionFloor,
            },
            format: "JSONEachRow",
          })
          const rows = await result.json<ProjectRow>()
          return rows.map(
            (row): ScoreSweepProject => ({
              organizationId: OrganizationId(normalizeCHString(row.organization_id)),
              projectId: ProjectId(normalizeCHString(row.project_id)),
              eligibleSessions: Number(row.eligible_sessions),
            }),
          )
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "ScoreProjectSweepSource.listProjects")))
    }),
})
