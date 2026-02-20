import { Job } from 'bullmq'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { subDays } from 'date-fns'
import { database } from '../../../client'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { issueEvaluationResults } from '../../../schema/models/issueEvaluationResults'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { queues } from '../../queues'
import { saveCursor, loadCursor, clearCursor } from '../../utils/backfillCursor'
import { MaintenanceJobLogger } from '../../utils/maintenanceJobLogger'
import { captureException } from '../../../utils/datadogCapture'
import { LatitudeError } from '../../../lib/errors'

export type BackfillEvaluationResultsIssueIdsJobData = {
  workspaceId: number
  batchSize?: number
  createdAtCursor?: string
  idCursor?: number
}

const DEFAULT_BATCH_SIZE = 1000
const BACKFILL_LOOKBACK_DAYS = 90
const JOB_NAME = 'backfillEvaluationResultsIssueIds'

type CursorState = { createdAtCursor: string; idCursor: number }

export async function backfillEvaluationResultsIssueIdsJob(
  job: Job<BackfillEvaluationResultsIssueIdsJobData>,
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
      `Starting issue_ids backfill for workspace ${workspaceId}`,
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

    const evalResultIdsSubquery = database
      .select({ id: evaluationResultsV2.id })
      .from(evaluationResultsV2)
      .where(and(...conditions))
      .orderBy(evaluationResultsV2.createdAt, evaluationResultsV2.id)
      .limit(batchSize)
      .as('eval_result_ids_subquery')

    const batchRaw = await database
      .select()
      .from(evaluationResultsV2)
      .innerJoin(
        evalResultIdsSubquery,
        eq(evaluationResultsV2.id, evalResultIdsSubquery.id),
      )
      .orderBy(evaluationResultsV2.createdAt, evaluationResultsV2.id)

    const batch = batchRaw.map((r) => r.evaluation_results_v2)

    if (batch.length === 0) {
      await clearCursor(JOB_NAME, workspaceId)
      await logger.done(
        `No more evaluation results to backfill for workspace ${workspaceId}`,
      )
      return
    }

    await logger.info(`Fetched ${batch.length} evaluation results`, {
      workspaceId,
      count: batch.length,
    })

    const evalResultIds = batch.map((r) => r.id)

    const issueLinks = await database
      .select({
        evaluationResultId: issueEvaluationResults.evaluationResultId,
        issueId: issueEvaluationResults.issueId,
      })
      .from(issueEvaluationResults)
      .where(
        and(
          eq(issueEvaluationResults.workspaceId, workspaceId),
          inArray(issueEvaluationResults.evaluationResultId, evalResultIds),
        ),
      )

    const issueIdsByEvalResultId = new Map<number, number[]>()
    for (const link of issueLinks) {
      const existing = issueIdsByEvalResultId.get(link.evaluationResultId) ?? []
      if (!existing.includes(link.issueId)) {
        existing.push(link.issueId)
      }
      issueIdsByEvalResultId.set(link.evaluationResultId, existing)
    }

    let updatedCount = 0
    for (const evalResult of batch) {
      const issueIds = issueIdsByEvalResultId.get(evalResult.id)
      if (!issueIds || issueIds.length === 0) continue

      try {
        await clickhouseClient().query({
          query: `
            ALTER TABLE ${TABLE_NAME}
            UPDATE issue_ids = {issueIds: Array(UInt64)}
            WHERE id = {evaluationResultId: UInt64}
              AND workspace_id = {workspaceId: UInt64}
          `,
          query_params: {
            workspaceId,
            evaluationResultId: evalResult.id,
            issueIds,
          },
        })
        updatedCount++
      } catch (error) {
        captureException(error as Error)
        captureException(
          new LatitudeError(
            `Failed to update issue_ids for evaluation result ${evalResult.id}`,
          ),
          { workspaceId, evaluationResultId: evalResult.id },
        )
      }
    }

    await logger.info(
      `Updated issue_ids for ${updatedCount} evaluation results`,
      { workspaceId, updatedCount, total: batch.length },
    )

    const lastResult = batch[batch.length - 1]!
    const nextCursor: CursorState = {
      createdAtCursor: lastResult.createdAt.toISOString(),
      idCursor: lastResult.id,
    }
    await saveCursor(JOB_NAME, workspaceId, nextCursor)

    if (batch.length === batchSize) {
      const { maintenanceQueue } = await queues()
      await maintenanceQueue.add(
        JOB_NAME,
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
