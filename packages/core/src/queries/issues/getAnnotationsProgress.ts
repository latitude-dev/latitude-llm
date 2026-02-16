import { subDays } from 'date-fns'
import { isNull, eq, or, inArray, sql, count, and } from 'drizzle-orm'
import {
  RUN_SOURCES,
  LogSources,
  MAIN_SPAN_TYPES,
  RunSourceGroup,
  SpanType,
  EvaluationType,
} from '@latitude-data/constants'
import { Workspace } from '../../schema/models/types/Workspace'
import { CommitsRepository } from '../../repositories/commitsRepository'
import { spans } from '../../schema/models/spans'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { isClickHouseSpansReadEnabled } from '../../services/workspaceFeatures/isClickHouseSpansReadEnabled'
import { getSpansCountForAnnotationsProgress as chGetSpansCountForAnnotationsProgress } from '../../queries/clickhouse/spans/getAnnotationsProgress'

// These are the log sources we consider for annotations progress by default
// We don't consider Experiment logs as they don't move the centroid
const DEFAULT_LOG_SOURCES = [
  ...RUN_SOURCES[RunSourceGroup.Production],
  LogSources.Playground,
]

async function getCommitIds({
  workspace,
  projectId,
  commitUuid,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
}) {
  const commitsRepo = new CommitsRepository(workspace.id)
  const currentCommitResult = await commitsRepo.getCommitByUuid({
    uuid: commitUuid,
    projectId: Number(projectId),
  })

  if (!Result.isOk(currentCommitResult)) return currentCommitResult

  const currentCommit = currentCommitResult.value
  const commits = await commitsRepo
    .getCommitsHistory({ commit: currentCommit })
    .then((commits) => {
      return {
        commitUuids: commits.map((commit) => commit.uuid),
        commitIds: commits.map((commit) => commit.id),
      }
    })

  return Result.ok(commits)
}

export async function getAnnotationsProgressCount(
  {
    workspace,
    commitIds,
    fromDate = subDays(new Date(), 30),
  }: {
    workspace: Workspace
    commitIds: number[]
    fromDate?: Date
  },
  db = database,
) {
  const hitlEvaluationUuids = await db
    .select({ evaluationUuid: evaluationVersions.evaluationUuid })
    .from(evaluationVersions)
    .where(
      and(
        eq(evaluationVersions.workspaceId, workspace.id),
        eq(evaluationVersions.type, EvaluationType.Human),
      ),
    )
    .then((r) => r.map((row) => row.evaluationUuid))

  if (hitlEvaluationUuids.length === 0) return 0

  return db
    .select({ count: count() })
    .from(evaluationResultsV2)
    .where(
      and(
        eq(evaluationResultsV2.workspaceId, workspace.id),
        inArray(evaluationResultsV2.evaluationUuid, hitlEvaluationUuids),
        inArray(evaluationResultsV2.commitId, commitIds),
        sql`${evaluationResultsV2.createdAt} >= ${fromDate}`,
        or(
          eq(evaluationResultsV2.hasPassed, true),
          and(
            eq(evaluationResultsV2.hasPassed, false),
            sql`${evaluationResultsV2.metadata}->>'reason' IS NOT NULL`,
            sql`${evaluationResultsV2.metadata}->>'reason' != ''`,
          ),
        ),
      ),
    )
    .then((r) => r[0]['count'])
}

export async function getAnnotationsProgress(
  {
    workspace,
    projectId,
    commitUuid,
    logSources = DEFAULT_LOG_SOURCES,
    fromDate = subDays(new Date(), 30),
  }: {
    workspace: Workspace
    projectId: number
    commitUuid: string
    logSources?: LogSources[]
    spanType?: SpanType
    fromDate?: Date
  },
  db = database,
) {
  const commitsResult = await getCommitIds({
    workspace,
    projectId,
    commitUuid,
  })

  if (!Result.isOk(commitsResult)) return commitsResult

  const { commitUuids, commitIds } = commitsResult.value

  const shouldUseClickHouse = await isClickHouseSpansReadEnabled(
    workspace.id,
    db,
  )

  let totalRuns: number

  if (shouldUseClickHouse) {
    totalRuns = await chGetSpansCountForAnnotationsProgress({
      workspaceId: workspace.id,
      commitUuids,
      logSources,
      fromDate,
    })
  } else {
    const conditions = [
      eq(spans.workspaceId, workspace.id),
      inArray(spans.type, Array.from(MAIN_SPAN_TYPES)),
      or(inArray(spans.source, logSources), isNull(spans.source)),
      inArray(spans.commitUuid, commitUuids),
      sql`${spans.startedAt} >= ${fromDate}`,
    ]

    totalRuns = await db
      .select({ count: count() })
      .from(spans)
      .where(and(...conditions))
      .then((r) => r[0]['count'])
  }

  const currentAnnotations = await getAnnotationsProgressCount({
    workspace,
    commitIds,
    fromDate,
  })

  return Result.ok({ totalRuns, currentAnnotations })
}
