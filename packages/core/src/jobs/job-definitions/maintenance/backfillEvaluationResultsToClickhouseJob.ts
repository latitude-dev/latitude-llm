import { Job } from 'bullmq'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { subDays } from 'date-fns'
import { database } from '../../../client'
import { insertRows } from '../../../clickhouse/insert'
import {
  EVALUATION_RESULTS_TABLE,
  EvaluationResultV2Row,
} from '../../../models/clickhouse/evaluationResults'
import { buildEvaluationResultRow } from '../../../services/evaluationsV2/results/clickhouse/buildRow'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { evaluationVersions } from '../../../schema/models/evaluationVersions'
import { commits } from '../../../schema/models/commits'
import { queues } from '../../queues'
import { captureException } from '../../../utils/datadogCapture'
import { LatitudeError } from '../../../lib/errors'
import type { EvaluationResultV2, EvaluationV2 } from '../../../constants'
import type { Commit } from '../../../schema/models/types/Commit'

export type BackfillEvaluationResultsToClickhouseJobData = {
  workspaceId: number
  batchSize?: number
  createdAtCursor?: string
  idCursor?: number
}

const DEFAULT_BATCH_SIZE = 1000
const BACKFILL_LOOKBACK_DAYS = 30

export async function backfillEvaluationResultsToClickhouseJob(
  job: Job<BackfillEvaluationResultsToClickhouseJobData>,
) {
  const {
    workspaceId,
    batchSize = DEFAULT_BATCH_SIZE,
    createdAtCursor,
    idCursor,
  } = job.data

  const yesterday = new Date('2026-02-12T00:00:00.000Z')
  const lookbackStart = subDays(yesterday, BACKFILL_LOOKBACK_DAYS)

  const conditions = [
    eq(evaluationResultsV2.workspaceId, workspaceId),
    gte(evaluationResultsV2.createdAt, lookbackStart),
    lt(evaluationResultsV2.createdAt, yesterday),
  ]
  if (createdAtCursor && idCursor !== undefined) {
    conditions.push(
      sql`(${evaluationResultsV2.createdAt}, ${evaluationResultsV2.id}) > (${createdAtCursor}::timestamp, ${idCursor})`,
    )
  }

  const batch = await database
    .select({
      result: evaluationResultsV2,
      evaluation: evaluationVersions,
      commit: commits,
    })
    .from(evaluationResultsV2)
    .innerJoin(
      evaluationVersions,
      and(
        eq(
          evaluationVersions.evaluationUuid,
          evaluationResultsV2.evaluationUuid,
        ),
        eq(evaluationVersions.commitId, evaluationResultsV2.commitId),
      ),
    )
    .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
    .where(and(...conditions))
    .orderBy(evaluationResultsV2.createdAt, evaluationResultsV2.id)
    .limit(batchSize)

  if (batch.length === 0) return

  const rows: EvaluationResultV2Row[] = batch.map((row) => {
    const result = row.result as unknown as EvaluationResultV2
    const ev = row.evaluation
    const evaluation: EvaluationV2 = {
      uuid: ev.evaluationUuid,
      versionId: ev.id,
      workspaceId: ev.workspaceId,
      commitId: ev.commitId,
      documentUuid: ev.documentUuid,
      issueId: ev.issueId,
      name: ev.name,
      description: ev.description,
      type: ev.type,
      metric: ev.metric,
      configuration: ev.configuration,
      alignmentMetricMetadata: ev.alignmentMetricMetadata,
      evaluateLiveLogs: ev.evaluateLiveLogs,
      createdAt: ev.createdAt,
      updatedAt: ev.updatedAt,
      deletedAt: ev.deletedAt,
      ignoredAt: ev.ignoredAt,
    }
    const commit = row.commit as Commit

    return buildEvaluationResultRow({ result, evaluation, commit })
  })

  const insertResult = await insertRows(EVALUATION_RESULTS_TABLE, rows)
  if (insertResult.error) {
    captureException(
      new LatitudeError(
        'Backfill: ClickHouse evaluation result insertion failed',
      ),
      { workspaceId, batchSize, error: String(insertResult.error) },
    )
    throw insertResult.error
  }

  if (batch.length === batchSize) {
    const lastResult = batch[batch.length - 1]!.result
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'backfillEvaluationResultsToClickhouseJob',
      {
        workspaceId,
        batchSize,
        createdAtCursor: lastResult.createdAt.toISOString(),
        idCursor: lastResult.id,
      },
      { attempts: 3 },
    )
  }
}
