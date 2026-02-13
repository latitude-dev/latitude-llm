import { Job } from 'bullmq'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { subDays } from 'date-fns'
import { database } from '../../../client'
import { clickhouseClient } from '../../../client/clickhouse'
import { insertRows } from '../../../clickhouse/insert'
import {
  EVALUATION_RESULTS_TABLE,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { buildEvaluationResultRow } from '../../../services/evaluationsV2/results/clickhouse/buildRow'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { evaluationVersions } from '../../../schema/models/evaluationVersions'
import { commits } from '../../../schema/models/commits'
import { queues } from '../../queues'
import { saveCursor, loadCursor, clearCursor } from '../../utils/backfillCursor'
import { MaintenanceJobLogger } from '../../utils/maintenanceJobLogger'
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
const JOB_NAME = 'backfillEvaluationResultsToClickhouse'

type CursorState = { createdAtCursor: string; idCursor: number }

export async function backfillEvaluationResultsToClickhouseJob(
  job: Job<BackfillEvaluationResultsToClickhouseJobData>,
) {
  const logger = new MaintenanceJobLogger(job)
  const { workspaceId, batchSize = DEFAULT_BATCH_SIZE } = job.data

  try {
    let { createdAtCursor, idCursor } = job.data
    if (!createdAtCursor || idCursor === undefined) {
      const saved = await loadCursor<CursorState>(JOB_NAME, workspaceId)
      if (saved) {
        createdAtCursor = saved.createdAtCursor
        idCursor = saved.idCursor
      }
    }

    await logger.info(
      `Starting eval results backfill for workspace ${workspaceId}`,
      { workspaceId, batchSize },
    )

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

    const idSubquery = database
      .select({ id: evaluationResultsV2.id })
      .from(evaluationResultsV2)
      .where(and(...conditions))
      .orderBy(evaluationResultsV2.createdAt, evaluationResultsV2.id)
      .limit(batchSize)
      .as('id_subquery')

    const batchRaw = await database
      .select()
      .from(evaluationResultsV2)
      .innerJoin(idSubquery, eq(evaluationResultsV2.id, idSubquery.id))
      .orderBy(evaluationResultsV2.createdAt, evaluationResultsV2.id)

    const batch = batchRaw.map((r) => r.evaluation_results_v2)

    if (batch.length === 0) {
      await clearCursor(JOB_NAME, workspaceId)
      await logger.done(
        `No more eval results to backfill for workspace ${workspaceId}`,
      )
      return
    }

    await logger.info(`Fetched ${batch.length} eval results`, {
      workspaceId,
      count: batch.length,
    })

    const commitIds = [...new Set(batch.map((r) => r.commitId))]

    const [commitsData, evalsData] = await Promise.all([
      database.select().from(commits).where(inArray(commits.id, commitIds)),
      database
        .select()
        .from(evaluationVersions)
        .where(
          and(
            inArray(evaluationVersions.commitId, commitIds),
            inArray(evaluationVersions.evaluationUuid, [
              ...new Set(batch.map((r) => r.evaluationUuid)),
            ]),
          ),
        ),
    ])

    const commitsMap = new Map(commitsData.map((c) => [c.id, c as Commit]))
    const evalsMap = new Map(
      evalsData.map((ev) => [`${ev.evaluationUuid}:${ev.commitId}`, ev]),
    )

    const batchIds = batch.map((r) => r.id)
    const existingResult = await clickhouseClient().query({
      query: `
        SELECT id
        FROM ${EVALUATION_RESULTS_TABLE} FINAL
        WHERE workspace_id = {workspaceId: UInt64}
          AND id IN ({ids: Array(UInt64)})
      `,
      format: 'JSONEachRow',
      query_params: { workspaceId, ids: batchIds },
    })
    const existingIds = new Set(
      (await existingResult.json<{ id: number }>()).map((r) => r.id),
    )

    const newResults = batch.filter((r) => !existingIds.has(r.id))

    const rows: EvaluationResultV2Row[] = []
    for (const resultRow of newResults) {
      const result = resultRow as unknown as EvaluationResultV2
      const commit = commitsMap.get(resultRow.commitId)
      const ev = evalsMap.get(
        `${resultRow.evaluationUuid}:${resultRow.commitId}`,
      )

      if (!commit || !ev) {
        captureException(
          new LatitudeError(
            `Backfill: missing ${!commit ? 'commit' : 'evaluation'} for result ${resultRow.id}`,
          ),
        )
        continue
      }

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

      rows.push(buildEvaluationResultRow({ result, evaluation, commit }))
    }

    if (rows.length > 0) {
      const insertResult = await insertRows(EVALUATION_RESULTS_TABLE, rows)
      if (insertResult.error) {
        await logger.error(`ClickHouse insertion failed`, {
          workspaceId,
          error: String(insertResult.error),
        })
        captureException(
          new LatitudeError(
            'Backfill: ClickHouse evaluation result insertion failed',
          ),
          { workspaceId, batchSize, error: String(insertResult.error) },
        )
        throw insertResult.error
      }

      await logger.info(
        `Inserted ${rows.length} eval results into ClickHouse`,
        { workspaceId, count: rows.length, skipped: existingIds.size },
      )
    } else {
      await logger.info(
        `All ${batch.length} eval results already exist in ClickHouse, skipping insert`,
      )
    }

    const lastResult = batch[batch.length - 1]!
    const nextCursor: CursorState = {
      createdAtCursor: lastResult.createdAt.toISOString(),
      idCursor: lastResult.id,
    }
    await saveCursor(JOB_NAME, workspaceId, nextCursor)

    if (batch.length === batchSize) {
      const { maintenanceQueue } = await queues()
      await maintenanceQueue.add(
        'backfillEvaluationResultsToClickhouseJob',
        {
          workspaceId,
          batchSize,
          ...nextCursor,
        },
        { attempts: 3 },
      )
      await logger.done(`Batch complete, re-enqueued for next batch`)
    } else {
      await clearCursor(JOB_NAME, workspaceId)
      await logger.done(
        `Backfill complete for workspace ${workspaceId} (${batch.length} results in final batch)`,
      )
    }
  } catch (error) {
    await logger.error(`Job failed: ${String(error)}`)
    throw error
  }
}
