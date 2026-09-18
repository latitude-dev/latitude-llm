import { createHash } from "node:crypto"
import { parseArgs } from "node:util"
import { deriveSamplingRates, resolveLaunchArtifacts, utcDateOf } from "@domain/agent-score"
import {
  FLAGGER_DEFAULT_CLASSIFIER_MODEL,
  SAFETY_SUITE_SLUGS,
  safetyJudgmentVersion,
  taskOutcomeJudgmentVersion,
} from "@domain/flaggers"
import type { SafetyFindingKind } from "@domain/scores"
import { OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  FlaggerScreeningDecisionRepositoryLive,
  MemoryRepositoryLive,
  OutcomeWindowDecisionSourceLive,
  SafetyWindowDecisionSourceLive,
  ScoreWindowSourceLive,
  SessionAnalysisRepositoryLive,
  SessionAssessmentBulkTelemetrySourceLive,
  SessionMomentLabelRepositoryLive,
  SessionRepositoryLive,
  SessionSemanticMomentRepositoryLive,
  SpanRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import type { Operator } from "@platform/db-postgres"
import {
  AgentScoreSnapshotRepositoryLive,
  FlaggerRepositoryLive,
  inArray,
  ScoreRepositoryLive,
  SessionAssessmentBulkJudgmentSourceLive,
  SignalRepositoryLive,
  SqlClientLive,
  withPostgres,
} from "@platform/db-postgres"
import { scores } from "@platform/db-postgres/schema/scores"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { snapshotProjectAgentScore } from "../workers/agent-score-snapshot.ts"

const DEFAULT_TREND_DAYS = 14
const POPULATION_DAYS = 60
const SCORE_INSERT_BATCH = 500
const DECISION_INSERT_BATCH = 2_000

const USAGE = `
Usage: pnpm --filter @app/workers agent-score:seed [options]

Gives the seeded project the evidence its Agent Score needs, then publishes a
trend by running the daily job once per date.

Options:
  --organization-id <id>  Organization to seed (default: the seed organization)
  --project-id <id>       Project to seed (default: the seed project)
  --days <n>              How many dates to publish, ending today (default: ${DEFAULT_TREND_DAYS})
  --help                  Show this help
`.trim()

const TASK_OUTCOME_SLUG = "task-failure"

/** Stable in [0, 1) for a session, so a re-run selects exactly the same sessions. */
const unit = (...parts: readonly string[]): number => {
  const digest = createHash("sha256").update(parts.join(" ")).digest()
  return digest.readUInt32BE(0) / 0x1_0000_0000
}

const NULL_PADDING = String.fromCharCode(0)

const trimFixedString = (value: string): string => {
  const end = value.indexOf(NULL_PADDING)
  return end === -1 ? value : value.slice(0, end)
}

const hex = (length: number, ...parts: readonly string[]): string =>
  createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, length)

/** A cuid-shaped id: lower-case letters and digits, 24 characters, stable per key. */
const cuidLike = (...parts: readonly string[]): string =>
  `c${BigInt(`0x${hex(24, ...parts)}`)
    .toString(36)
    .padStart(23, "0")
    .slice(0, 23)}`

interface ScorableSession {
  readonly sessionId: string
  readonly startedAt: Date
  readonly endedAt: Date
  readonly lastActivity: Date
  readonly traceIds: readonly string[]
  readonly failed: boolean
  /** The analysis generation screening would have run on, when the session already has one. */
  readonly analysisHash: string | null
}

/**
 * The sessions a screening pass would have seen.
 *
 * Deliberately the same population shape the score reads — settled production sessions that moved
 * tokens — so the seeded examined share is measured against the denominator the floors use. The
 * session's own outcome tag decides the verdict rather than a fresh draw, because the seeded traces
 * already say whether they succeeded and a verdict that disagreed with the trace it describes is
 * the one inconsistency nobody looking at this page could explain.
 */
const readScorableSessions = async ({
  organizationId,
  projectId,
}: {
  readonly organizationId: string
  readonly projectId: string
}): Promise<readonly ScorableSession[]> => {
  const client = getClickhouseClient()
  const result = await client.query({
    query: `
      WITH analysed AS (
        SELECT session_id, analysis_hash
        FROM session_analyses
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
        ORDER BY session_id ASC, indexed_at DESC
        LIMIT 1 BY session_id
      )
      SELECT
        scorable.session_id AS session_id,
        toUnixTimestamp64Milli(scorable.started_at) AS started_at_ms,
        toUnixTimestamp64Milli(scorable.ended_at) AS ended_at_ms,
        toUnixTimestamp64Milli(scorable.last_activity) AS last_activity_ms,
        scorable.trace_ids AS trace_ids,
        has(scorable.tags, 'failure') AS failed,
        analysed.analysis_hash AS analysis_hash
      FROM (
        SELECT
          session_id,
          sum(tokens_total) AS tokens_total,
          groupUniqArrayIfMerge(models) AS models,
          argMaxIfMerge(simulation_id) AS simulation_id,
          groupUniqArrayArray(tags) AS tags,
          groupUniqArrayMerge(trace_ids) AS trace_ids,
          min(min_start_time) AS started_at,
          max(max_end_time) AS ended_at,
          if(
            max(max_start_time) >= min(min_start_time),
            max(max_start_time),
            max(max_end_time)
          ) AS last_activity
        FROM sessions
        WHERE organization_id = {organizationId:String}
          AND project_id = {projectId:String}
          AND min_start_time >= subtractDays(now64(9, 'UTC'), {populationDays:UInt16})
        GROUP BY session_id
        HAVING (tokens_total > 0 OR length(models) > 0) AND simulation_id = ''
      ) AS scorable
      LEFT JOIN analysed ON analysed.session_id = scorable.session_id
    `,
    query_params: { organizationId, projectId, populationDays: POPULATION_DAYS + 31 },
    format: "JSONEachRow",
  })
  const rows = await result.json<{
    readonly session_id: string
    readonly started_at_ms: string
    readonly ended_at_ms: string
    readonly last_activity_ms: string
    readonly trace_ids: readonly string[]
    readonly failed: number | boolean
    readonly analysis_hash: string
  }>()

  return rows.map((row) => ({
    sessionId: row.session_id,
    startedAt: new Date(Number(row.started_at_ms)),
    endedAt: new Date(Number(row.ended_at_ms)),
    lastActivity: new Date(Number(row.last_activity_ms)),
    traceIds: row.trace_ids,
    failed: Boolean(row.failed),
    // An unmatched `LEFT JOIN` fills a `FixedString` with nulls rather than leaving it empty.
    analysisHash: trimFixedString(row.analysis_hash) || null,
  }))
}

/**
 * Records that the sessions screening is about to describe were analysed.
 *
 * Screening runs off a session analysis and stamps the generation it read, and the assessment
 * reader drops any decision whose hash is not the session's newest analysis. Seeding decisions
 * without this leaves them invisible to everything that reads a session, so the issue rows lose the
 * selection probability they need and fall back to raw counts.
 */
const writeMissingAnalyses = async ({
  organizationId,
  projectId,
  sessions,
}: {
  readonly organizationId: string
  readonly projectId: string
  readonly sessions: readonly ScorableSession[]
}): Promise<number> => {
  const missing = sessions.filter((session) => session.analysisHash === null)
  if (missing.length === 0) return 0

  const client = getClickhouseClient()
  const rows = missing.map((session) => ({
    organization_id: organizationId,
    project_id: projectId,
    session_id: session.sessionId,
    start_time: formatClickhouseTimestamp(session.startedAt),
    end_time: formatClickhouseTimestamp(session.endedAt),
    trace_ids: session.traceIds,
    analysis_hash: analysisHashOf(session),
    analysis_status: "analyzed",
    status_reason: "",
    indexed_at: formatClickhouseTimestamp(session.lastActivity),
  }))
  for (let offset = 0; offset < rows.length; offset += DECISION_INSERT_BATCH) {
    await client.insert({
      table: "session_analyses",
      values: rows.slice(offset, offset + DECISION_INSERT_BATCH),
      format: "JSONEachRow",
    })
  }
  return rows.length
}

/** The session's own analysis generation when it has one, so a seeded decision attaches to it. */
const analysisHashOf = (session: ScorableSession): string =>
  session.analysisHash ?? hex(64, session.sessionId, "analysis")

interface SessionExamination {
  readonly session: ScorableSession
  readonly analysisHash: string
  readonly judgedForOutcome: boolean
  readonly examinedBySuite: boolean
  readonly safetyFinding: SafetyFindingKind | null
}

/**
 * Confirmed harm is the agent complying or disclosing; the other kinds are what reached it.
 *
 * Only the first two move Safety. The exposure kinds are seeded at a much higher rate on purpose:
 * a project that is attacked often and never complies is the shape the page has to be able to show,
 * and it is the one a harm-only fixture cannot produce.
 */
const CONFIRMED_HARM_RATE = 0.004
const EXPOSURE_RATE = 0.05

const safetyFindingFor = (sessionId: string): SafetyFindingKind | null => {
  const draw = unit(sessionId, "safety-finding")
  if (draw < CONFIRMED_HARM_RATE) return draw < CONFIRMED_HARM_RATE / 2 ? "injectionCompliance" : "piiDisclosure"
  if (draw < CONFIRMED_HARM_RATE + EXPOSURE_RATE) {
    return draw < CONFIRMED_HARM_RATE + EXPOSURE_RATE / 2 ? "injectionAttempt" : "piiExposure"
  }
  return null
}

const examine = ({
  sessions,
  outcomeRate,
  safetyRate,
}: {
  readonly sessions: readonly ScorableSession[]
  readonly outcomeRate: number
  readonly safetyRate: number
}): readonly SessionExamination[] =>
  sessions.map((session) => {
    const examinedBySuite = unit(session.sessionId, "safety") < safetyRate
    return {
      session,
      analysisHash: analysisHashOf(session),
      judgedForOutcome: unit(session.sessionId, TASK_OUTCOME_SLUG) < outcomeRate,
      examinedBySuite,
      safetyFinding: examinedBySuite ? safetyFindingFor(session.sessionId) : null,
    }
  })

const formatClickhouseTimestamp = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")

interface DecisionRow {
  readonly decision_id: string
  readonly organization_id: string
  readonly project_id: string
  readonly session_id: string
  readonly flagger_slug: string
  readonly analysis_hash: string
  readonly scoring_artifact_version: string
  readonly attempt: number
  readonly version: number
  readonly selected: boolean
  readonly reason: string
  readonly inclusion_probability: number | null
  readonly hint_kinds: readonly string[]
  readonly outcome: string | null
  readonly created_at: string
}

const buildDecisionRows = ({
  organizationId,
  projectId,
  examinations,
  outcomeRate,
  safetyRate,
  outcomeVersion,
  safetyVersion,
}: {
  readonly organizationId: string
  readonly projectId: string
  readonly examinations: readonly SessionExamination[]
  readonly outcomeRate: number
  readonly safetyRate: number
  readonly outcomeVersion: string
  readonly safetyVersion: string
}): readonly DecisionRow[] =>
  examinations.flatMap((examination) => {
    const { session } = examination
    const base = {
      organization_id: organizationId,
      project_id: projectId,
      session_id: session.sessionId,
      analysis_hash: examination.analysisHash,
      attempt: 1,
      version: 1,
      hint_kinds: [],
      created_at: formatClickhouseTimestamp(session.lastActivity),
    }

    const suiteRows = SAFETY_SUITE_SLUGS.map((slug) => ({
      ...base,
      decision_id: hex(64, session.sessionId, slug),
      flagger_slug: slug,
      scoring_artifact_version: safetyVersion,
      selected: examination.examinedBySuite,
      reason: examination.examinedBySuite ? "ordinary-sample" : "skipped",
      inclusion_probability: examination.examinedBySuite ? safetyRate : null,
      outcome: examination.examinedBySuite ? (examination.safetyFinding ? "matched" : "unmatched") : null,
    }))

    return [
      {
        ...base,
        decision_id: hex(64, session.sessionId, TASK_OUTCOME_SLUG),
        flagger_slug: TASK_OUTCOME_SLUG,
        scoring_artifact_version: outcomeVersion,
        selected: examination.judgedForOutcome,
        reason: examination.judgedForOutcome ? "ordinary-sample" : "skipped",
        inclusion_probability: examination.judgedForOutcome ? outcomeRate : null,
        outcome: examination.judgedForOutcome ? (session.failed ? "failure" : "success") : null,
      },
      ...suiteRows,
    ]
  })

/**
 * Clears the project's decisions before rewriting them.
 *
 * The table is a plain `MergeTree`, so a second run would append a duplicate generation of every
 * decision rather than replacing it, and a re-run with different rates would leave the sessions it
 * no longer selects looking examined.
 */
const clearDecisions = async ({
  organizationId,
  projectId,
}: {
  readonly organizationId: string
  readonly projectId: string
}): Promise<void> => {
  await getClickhouseClient().command({
    query: `
      DELETE FROM flagger_screening_decisions
      WHERE organization_id = {organizationId:String}
        AND project_id = {projectId:String}
        AND flagger_slug IN ({slugs:Array(String)})
    `,
    query_params: { organizationId, projectId, slugs: [TASK_OUTCOME_SLUG, ...SAFETY_SUITE_SLUGS] },
  })
}

const writeDecisions = async (rows: readonly DecisionRow[]): Promise<void> => {
  const client = getClickhouseClient()
  for (let offset = 0; offset < rows.length; offset += DECISION_INSERT_BATCH) {
    await client.insert({
      table: "flagger_screening_decisions",
      values: rows.slice(offset, offset + DECISION_INSERT_BATCH),
      format: "JSONEachRow",
    })
  }
}

const OUTCOME_FAILURE_FEEDBACK =
  "The customer's request was not resolved: the agent closed the conversation without completing the action it was asked for."
const OUTCOME_SUCCESS_FEEDBACK = "The customer's request was completed and confirmed back to them."

const SAFETY_FEEDBACK: Record<SafetyFindingKind, string> = {
  injectionAttempt: "The transcript carried an instruction trying to override the agent's own rules.",
  injectionDefense: "The agent recognised the injected instruction and refused it.",
  injectionCompliance: "The agent followed an instruction injected through content it was reading.",
  piiExposure: "Personal data reached the agent's context from an upstream tool result.",
  piiDisclosure: "The agent repeated a customer's personal data back into an unrelated channel.",
}

type ScoreInsert = typeof scores.$inferInsert

const buildScoreRows = ({
  organizationId,
  projectId,
  examinations,
  outcomeVersion,
  safetyVersion,
}: {
  readonly organizationId: string
  readonly projectId: string
  readonly examinations: readonly SessionExamination[]
  readonly outcomeVersion: string
  readonly safetyVersion: string
}): readonly ScoreInsert[] =>
  examinations.flatMap((examination): ScoreInsert[] => {
    const { session } = examination
    const base = {
      organizationId,
      projectId,
      sessionId: session.sessionId,
      traceId: null,
      spanId: null,
      sourceType: "annotation" as const,
      sourceId: "SYSTEM",
      simulationId: null,
      signalId: null,
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      annotatorId: null,
      createdAt: session.lastActivity,
      updatedAt: session.lastActivity,
    }

    const rows: ScoreInsert[] = []

    if (examination.judgedForOutcome) {
      rows.push({
        ...base,
        id: cuidLike(session.sessionId, TASK_OUTCOME_SLUG),
        value: session.failed ? 0 : 1,
        passed: !session.failed,
        feedback: session.failed ? OUTCOME_FAILURE_FEEDBACK : OUTCOME_SUCCESS_FEEDBACK,
        metadata: {
          rawFeedback: session.failed ? OUTCOME_FAILURE_FEEDBACK : OUTCOME_SUCCESS_FEEDBACK,
          flaggerSlug: TASK_OUTCOME_SLUG,
          flaggerPath: "sampled",
          scoringArtifactVersion: outcomeVersion,
          analysisHash: examination.analysisHash,
        },
      })
    }

    if (examination.safetyFinding) {
      const findingKind = examination.safetyFinding
      const slug = findingKind.startsWith("injection") ? "jailbreaking" : "pii-leakage"
      rows.push({
        ...base,
        id: cuidLike(session.sessionId, slug),
        value: 0,
        passed: false,
        feedback: SAFETY_FEEDBACK[findingKind],
        metadata: {
          rawFeedback: SAFETY_FEEDBACK[findingKind],
          flaggerSlug: slug,
          flaggerPath: "sampled",
          safetyFindingKind: findingKind,
          scoringArtifactVersion: safetyVersion,
          analysisHash: examination.analysisHash,
        },
      })
    }

    return rows
  })

/**
 * Replaces the judgments this script owns, leaving every other seeded score alone.
 *
 * Deletes by the ids it would write for every session rather than by what it is about to insert: a
 * re-run at a different sampling rate selects a different set, and a session that is no longer
 * examined has to stop carrying a verdict.
 */
const writeScores = ({
  rows,
  ownedIds,
  organizationId,
}: {
  readonly rows: readonly ScoreInsert[]
  readonly ownedIds: readonly string[]
  readonly organizationId: OrganizationId
}) =>
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
    for (let offset = 0; offset < ownedIds.length; offset += SCORE_INSERT_BATCH) {
      const batch = ownedIds.slice(offset, offset + SCORE_INSERT_BATCH)
      yield* sqlClient.query(async (tx) => {
        await tx.delete(scores).where(inArray(scores.id, batch))
      })
    }
    for (let offset = 0; offset < rows.length; offset += SCORE_INSERT_BATCH) {
      const batch = rows.slice(offset, offset + SCORE_INSERT_BATCH)
      yield* sqlClient.query(async (tx) => {
        await tx.insert(scores).values(batch)
      })
    }
  }).pipe(Effect.provide(SqlClientLive(getPostgresClient(), organizationId)))

/**
 * Publishes one date through the same job the daily cron runs.
 *
 * Oldest first, because window selection reads the previous day's stored step to decide whether to
 * move: running these backwards would give every date the hysteresis input of a day that had not
 * happened yet, and the seeded trend would not be one the scheduled job could have produced.
 */
const publishDate = ({
  organizationId,
  projectId,
  date,
  force,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly date: string
  /** Recompute a date that already scored, which is how the explanation cache gets warmed. */
  readonly force: boolean
}) => {
  const artifacts = resolveLaunchArtifacts({ judge: FLAGGER_DEFAULT_CLASSIFIER_MODEL })

  return snapshotProjectAgentScore({
    organizationId,
    projectId,
    date,
    ...(force ? { force: true } : {}),
    artifact: artifacts.agentScore,
    costArtifact: artifacts.cost,
    catalog: artifacts.catalog,
    latencyArtifact: artifacts.latency,
    judge: FLAGGER_DEFAULT_CLASSIFIER_MODEL,
  }).pipe(
    withPostgres(
      Layer.mergeAll(
        AgentScoreSnapshotRepositoryLive,
        FlaggerRepositoryLive,
        SessionAssessmentBulkJudgmentSourceLive.pipe(
          Layer.provideMerge(Layer.mergeAll(ScoreRepositoryLive, SignalRepositoryLive)),
        ),
        ScoreRepositoryLive,
      ),
      getPostgresClient(),
      organizationId,
    ),
    withClickHouse(
      Layer.mergeAll(
        ScoreWindowSourceLive,
        OutcomeWindowDecisionSourceLive,
        SafetyWindowDecisionSourceLive,
        SessionAssessmentBulkTelemetrySourceLive.pipe(
          Layer.provideMerge(
            Layer.mergeAll(
              SessionRepositoryLive,
              SpanRepositoryLive,
              SessionAnalysisRepositoryLive,
              SessionSemanticMomentRepositoryLive,
              SessionMomentLabelRepositoryLive,
              FlaggerScreeningDecisionRepositoryLive,
              MemoryRepositoryLive,
            ),
          ),
        ),
      ),
      getClickhouseClient(),
      organizationId,
    ),
    Effect.provide(RedisCacheStoreLive(getRedisClient())),
  )
}

const datesEndingToday = (days: number): readonly string[] => {
  const todayMs = new Date(`${utcDateOf(new Date())}T00:00:00.000Z`).getTime()
  return Array.from({ length: days }, (_, offset) => utcDateOf(new Date(todayMs - (days - 1 - offset) * 86_400_000)))
}

const main = async () => {
  // One level up, so the helper resolves the repository root the way `server.ts` does.
  loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

  const { values } = parseArgs({
    options: {
      "organization-id": { type: "string" },
      "project-id": { type: "string" },
      days: { type: "string" },
      help: { type: "boolean" },
    },
  })

  if (values.help) {
    console.log(USAGE)
    return
  }

  if (process.env.NODE_ENV === "production") {
    console.error("ERROR: agent-score:seed refuses to run in production")
    process.exitCode = 1
    return
  }

  const organizationId = OrganizationId(values["organization-id"] ?? SEED_ORG_ID)
  const projectId = ProjectId(values["project-id"] ?? SEED_PROJECT_ID)
  const trendDays = values.days ? Number(values.days) : DEFAULT_TREND_DAYS
  if (!Number.isInteger(trendDays) || trendDays <= 0) throw new Error("--days must be a positive integer")

  const artifacts = resolveLaunchArtifacts({ judge: FLAGGER_DEFAULT_CLASSIFIER_MODEL })
  const sessions = await readScorableSessions({ organizationId, projectId })
  if (sessions.length === 0) {
    console.log("No scorable sessions found. Run `pnpm ch:seed` first.")
    return
  }

  // Derived for a project sitting exactly on the window's session target, which is the tightest
  // case any selected window can present: the selector stops at the shortest step that reaches the
  // target, so a rate derived from the whole population would under-examine every window it picks.
  const rates = deriveSamplingRates({ eligibleSessions: artifacts.agentScore.window.sessionTarget })
  const outcomeRate = rates.taskOutcomePercent / 100
  const safetyRate = rates.safetySuitePercent / 100
  const outcomeVersion = taskOutcomeJudgmentVersion(FLAGGER_DEFAULT_CLASSIFIER_MODEL)
  const safetyVersion = safetyJudgmentVersion(FLAGGER_DEFAULT_CLASSIFIER_MODEL)

  const examinations = examine({ sessions, outcomeRate, safetyRate })
  console.log(
    `- ${sessions.length} scorable sessions; judging ${rates.taskOutcomePercent}% for Outcome, examining ${rates.safetySuitePercent}% with the Safety suite`,
  )

  const analysesWritten = await writeMissingAnalyses({ organizationId, projectId, sessions })
  if (analysesWritten > 0) console.log(`- recorded ${analysesWritten} session analyses`)

  await clearDecisions({ organizationId, projectId })
  const decisionRows = buildDecisionRows({
    organizationId,
    projectId,
    examinations,
    outcomeRate,
    safetyRate,
    outcomeVersion,
    safetyVersion,
  })
  await writeDecisions(decisionRows)
  console.log(`- wrote ${decisionRows.length} screening decisions`)

  const scoreRows = buildScoreRows({ organizationId, projectId, examinations, outcomeVersion, safetyVersion })
  const ownedScoreIds = sessions.flatMap((session) =>
    [TASK_OUTCOME_SLUG, ...SAFETY_SUITE_SLUGS].map((slug) => cuidLike(session.sessionId, slug)),
  )
  await Effect.runPromise(writeScores({ rows: scoreRows, ownedIds: ownedScoreIds, organizationId }))
  console.log(`- wrote ${scoreRows.length} judgments`)

  const dates = datesEndingToday(trendDays)
  for (const date of dates) {
    // The cache the page reads is keyed by project, not date, so only the newest run has to warm it
    // — and it has to, because an unforced run on a date that already scored returns before it
    // computes anything.
    const result = await Effect.runPromise(
      publishDate({ organizationId, projectId, date, force: date === dates.at(-1) }),
    )
    console.log(
      result.status === "published" || result.status === "refreshed"
        ? `- ${date}: ${result.score.toFixed(1)}`
        : result.status === "withheld"
          ? `- ${date}: withheld (${result.reason})`
          : `- ${date}: already published`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
