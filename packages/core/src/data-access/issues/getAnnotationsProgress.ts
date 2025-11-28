import { subDays } from 'date-fns'
import { isNull, eq, or, inArray, sql, count, and } from 'drizzle-orm'
import {
  RUN_SOURCES,
  LogSources,
  RunSourceGroup,
  SpanType,
  EvaluationType,
} from '@latitude-data/constants'
import { Workspace } from '../../schema/models/types/Workspace'
import { CommitsRepository } from '../../repositories'
import { spans } from '../../schema/models/spans'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { database } from '../../client'
import { Result } from '../../lib/Result'

// These are the log sources we consider for annotations progress by default
// We don't consider Experiment logs as they don't move the centroid
const DEFAULT_LOG_SOURCES = [
  ...RUN_SOURCES[RunSourceGroup.Production],
  LogSources.Playground,
]

/**
 * Read `getCommitsHistory` documentation for more details.
 */
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

/**
 * Count the number of evaluation results of type HITL.
 * This is what we consider as valid annotations.
 */
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
        // Count as progress: HITL passed OR HITL failed with reason (non-empty)
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

/**
 * This do a count of:
 * - totalRuns: total number of runs in the project from the given log sources
 *   and span type and the given date
 * - currentAnnotations: Number of evaluation results of type HITL.
 *
 * Usually this method is used passing a fromDate of 30 days ago to get the progress
 * of annotations in the last 30 days.
 */
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
  const conditions = [
    eq(spans.workspaceId, workspace.id),
    eq(spans.type, SpanType.Prompt),
    or(inArray(spans.source, logSources), isNull(spans.source)),
    inArray(spans.commitUuid, commitUuids),
    sql`${spans.startedAt} >= ${fromDate}`,
  ]

  const totalRuns = await db
    .select({ count: count() })
    .from(spans)
    .where(and(...conditions))
    .then((r) => r[0]['count'])

  const currentAnnotations = await getAnnotationsProgressCount({
    workspace,
    commitIds,
    fromDate,
  })

  console.log('Annotations progress:', { totalRuns, currentAnnotations })

  return Result.ok({ totalRuns, currentAnnotations })
}
