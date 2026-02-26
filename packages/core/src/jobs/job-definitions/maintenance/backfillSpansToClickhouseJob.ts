import { Job } from 'bullmq'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { addDays, subDays } from 'date-fns'
import { database } from '../../../client'
import { clickhouseClient } from '../../../client/clickhouse'
import { toClickHouseDateTime, insertRows } from '../../../clickhouse/insert'
import { SpanInput, TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { spans } from '../../../schema/models/spans'
import { SpanType } from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { findWorkspaceSubscription } from '../../../services/subscriptions/data-access/find'
import {
  DEFAULT_RETENTION_PERIOD_DAYS,
  SubscriptionPlans,
} from '../../../plans'
import { queues } from '../../queues'
import { saveCursor, loadCursor, clearCursor } from '../../utils/backfillCursor'
import { MaintenanceJobLogger } from '../../utils/maintenanceJobLogger'
import { captureException } from '../../../utils/datadogCapture'
import { LatitudeError } from '../../../lib/errors'

export type BackfillSpansToClickhouseJobData = {
  workspaceId: number
  batchSize?: number
  startedAtCursor?: string
  spanIdCursor?: string
}

const DEFAULT_BATCH_SIZE = 100
const BACKFILL_LOOKBACK_DAYS = 30
const JOB_NAME = 'backfillSpansToClickhouse'

type CursorState = { startedAtCursor: string; spanIdCursor: string }

export async function backfillSpansToClickhouseJob(
  job: Job<BackfillSpansToClickhouseJobData>,
) {
  const logger = new MaintenanceJobLogger(job)
  const { workspaceId, batchSize = DEFAULT_BATCH_SIZE } = job.data

  try {
    let { startedAtCursor, spanIdCursor } = job.data
    if (!startedAtCursor || !spanIdCursor) {
      const saved = await loadCursor<CursorState>(JOB_NAME, workspaceId)
      if (saved) {
        startedAtCursor = saved.startedAtCursor
        spanIdCursor = saved.spanIdCursor
      }
    }

    await logger.info(`Starting span backfill for workspace ${workspaceId}`, {
      workspaceId,
      batchSize,
    })

    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace) {
      await logger.warn(`Workspace ${workspaceId} not found, skipping`)
      await logger.done(`Skipped — workspace not found`)
      return
    }

    const subscriptionResult = await findWorkspaceSubscription({ workspace })
    const retentionDays =
      subscriptionResult.ok && subscriptionResult.value
        ? SubscriptionPlans[subscriptionResult.value.plan].retention_period
        : DEFAULT_RETENTION_PERIOD_DAYS
    const retentionExpiresAt = addDays(new Date(), retentionDays)

    const now = new Date()
    const lookbackStart = subDays(now, BACKFILL_LOOKBACK_DAYS)

    const conditions = [
      eq(spans.workspaceId, workspaceId),
      gte(spans.startedAt, lookbackStart),
      lt(spans.startedAt, now),
    ]
    if (startedAtCursor && spanIdCursor) {
      conditions.push(
        sql`(${spans.startedAt}, ${spans.id}) > (${startedAtCursor}::timestamp, ${spanIdCursor})`,
      )
    }

    const batch = await database
      .select()
      .from(spans)
      .where(and(...conditions))
      .orderBy(spans.startedAt, spans.id)
      .limit(batchSize)

    if (batch.length === 0) {
      await clearCursor(JOB_NAME, workspaceId)
      await logger.done(
        `No more spans to backfill for workspace ${workspaceId}`,
      )
      return
    }

    await logger.info(`Fetched ${batch.length} spans`, {
      workspaceId,
      count: batch.length,
    })

    const spanIds = batch.map((s) => s.id)
    const existingResult = await clickhouseClient().query({
      query: `
        SELECT span_id
        FROM ${TABLE_NAME} FINAL
        WHERE workspace_id = {workspaceId: UInt64}
          AND span_id IN ({spanIds: Array(String)})
      `,
      format: 'JSONEachRow',
      query_params: { workspaceId, spanIds },
    })
    const existingSpanIds = new Set(
      (await existingResult.json<{ span_id: string }>()).map((r) => r.span_id),
    )

    const newSpans = batch.filter((s) => !existingSpanIds.has(s.id))
    if (newSpans.length === 0) {
      await logger.info(
        `All ${batch.length} spans already exist in ClickHouse, skipping insert`,
      )
    }

    const rows: SpanInput[] = newSpans.map((span) => {
      const isCompletion = span.type === SpanType.Completion
      return {
        workspace_id: span.workspaceId,
        trace_id: span.traceId,
        span_id: span.id,
        parent_id: span.parentId ?? null,
        previous_trace_id: span.previousTraceId ?? null,
        api_key_id: span.apiKeyId,
        document_log_uuid: span.documentLogUuid ?? null,
        document_uuid: span.documentUuid ?? null,
        commit_uuid: span.commitUuid ?? null,
        experiment_uuid: span.experimentUuid ?? null,
        project_id: span.projectId ?? null,
        test_deployment_id: span.testDeploymentId ?? null,
        name: span.name,
        kind: span.kind,
        type: span.type,
        status: span.status,
        message: span.message ?? null,
        duration_ms: span.duration,
        started_at: toClickHouseDateTime(span.startedAt),
        ended_at: toClickHouseDateTime(span.endedAt),
        source: span.source ?? null,
        provider: isCompletion ? '' : '',
        model: isCompletion ? (span.model ?? null) : null,
        cost: isCompletion ? (span.cost ?? null) : null,
        tokens_prompt: isCompletion ? (span.tokensPrompt ?? null) : null,
        tokens_cached: isCompletion ? (span.tokensCached ?? null) : null,
        tokens_reasoning: isCompletion ? (span.tokensReasoning ?? null) : null,
        tokens_completion: isCompletion
          ? (span.tokensCompletion ?? null)
          : null,
        ingested_at: toClickHouseDateTime(new Date()),
        retention_expires_at: toClickHouseDateTime(retentionExpiresAt),
      }
    })

    if (rows.length > 0) {
      const result = await insertRows(TABLE_NAME, rows)
      if (result.error) {
        await logger.error(`ClickHouse insertion failed`, {
          workspaceId,
          error: String(result.error),
        })
        captureException(
          new LatitudeError('Backfill: ClickHouse span insertion failed'),
          { workspaceId, batchSize, error: String(result.error) },
        )
        throw result.error
      }

      await logger.info(`Inserted ${rows.length} spans into ClickHouse`, {
        workspaceId,
        count: rows.length,
        skipped: existingSpanIds.size,
      })
    }

    const lastSpan = batch[batch.length - 1]!
    const nextCursor: CursorState = {
      startedAtCursor: lastSpan.startedAt.toISOString(),
      spanIdCursor: lastSpan.id,
    }
    await saveCursor(JOB_NAME, workspaceId, nextCursor)

    if (batch.length === batchSize) {
      const { maintenanceQueue } = await queues()
      await maintenanceQueue.add(
        'backfillSpansToClickhouseJob',
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
        `Backfill complete for workspace ${workspaceId} (${batch.length} spans in final batch)`,
      )
    }
  } catch (error) {
    await logger.error(`Job failed: ${String(error)}`)
    throw error
  }
}
