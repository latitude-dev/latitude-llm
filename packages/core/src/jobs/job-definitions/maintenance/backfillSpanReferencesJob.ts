import { Job } from 'bullmq'
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { addDays } from 'date-fns'
import { toClickHouseDateTime, insertRows } from '../../../clickhouse/insert'
import { SpanRow, SPANS_TABLE } from '../../../clickhouse/models/spans'
import { SpanType } from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { LatitudeError } from '../../../lib/errors'
import { database } from '../../../client'
import {
  DEFAULT_RETENTION_PERIOD_DAYS,
  SubscriptionPlans,
} from '../../../plans'
import { spans } from '../../../schema/models/spans'
import { findWorkspaceSubscription } from '../../../services/subscriptions/data-access/find'
import { captureException } from '../../../utils/datadogCapture'
import { queues } from '../../queues'
import { loadCursor, saveCursor, clearCursor } from '../../utils/backfillCursor'
import { MaintenanceJobLogger } from '../../utils/maintenanceJobLogger'

export type BackfillSpanReferencesJobData = {
  workspaceId: number
  batchSize?: number
  traceIdCursor?: string
}

type TraceReferences = {
  documentLogUuid?: string
  documentUuid?: string
  commitUuid?: string
  experimentUuid?: string
  projectId?: number
  testDeploymentId?: number
  source?: (typeof spans.$inferSelect)['source']
}

const DEFAULT_BATCH_SIZE = 500
const JOB_NAME = 'backfillSpanReferencesJob'

type CursorState = { traceIdCursor: string }

export async function backfillSpanReferencesJob(
  job: Job<BackfillSpanReferencesJobData>,
) {
  const logger = new MaintenanceJobLogger(job)
  const { workspaceId, batchSize = DEFAULT_BATCH_SIZE } = job.data

  try {
    let { traceIdCursor } = job.data
    if (!traceIdCursor) {
      const saved = await loadCursor<CursorState>(JOB_NAME, workspaceId)
      if (saved) {
        traceIdCursor = saved.traceIdCursor
      }
    }

    await logger.info(`Starting span references backfill for ${workspaceId}`, {
      workspaceId,
      batchSize,
    })

    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace) {
      await logger.warn(`Workspace ${workspaceId} not found, skipping`)
      await logger.done('Skipped - workspace not found')
      return
    }

    const traceIdsBatch = await database
      .select({ traceId: spans.traceId })
      .from(spans)
      .where(
        and(
          eq(spans.workspaceId, workspaceId),
          traceIdCursor ? gt(spans.traceId, traceIdCursor) : undefined,
        ),
      )
      .groupBy(spans.traceId)
      .orderBy(spans.traceId)
      .limit(batchSize)

    if (traceIdsBatch.length === 0) {
      await clearCursor(JOB_NAME, workspaceId)
      await logger.done(
        `No more traces with missing references for ${workspaceId}`,
      )
      return
    }

    const traceIds = traceIdsBatch.map((r) => r.traceId)

    const traceSpans = await database
      .select()
      .from(spans)
      .where(
        and(
          eq(spans.workspaceId, workspaceId),
          inArray(spans.traceId, traceIds),
        ),
      )

    const groupedByTrace = new Map<string, typeof traceSpans>()
    for (const span of traceSpans) {
      const group = groupedByTrace.get(span.traceId) ?? []
      group.push(span)
      groupedByTrace.set(span.traceId, group)
    }

    const updatedTraceIds: string[] = []

    for (const traceId of traceIds) {
      const group = groupedByTrace.get(traceId) ?? []
      if (group.length === 0) continue

      const refs = extractReferences(group)
      const set: Partial<typeof spans.$inferInsert> = {
        documentLogUuid: refs.documentLogUuid,
        documentUuid: refs.documentUuid,
        commitUuid: refs.commitUuid,
        experimentUuid: refs.experimentUuid,
        projectId: refs.projectId,
        testDeploymentId: refs.testDeploymentId,
        source: refs.source,
      }

      const missingConditions = [
        refs.documentLogUuid ? isNull(spans.documentLogUuid) : undefined,
        refs.documentUuid ? isNull(spans.documentUuid) : undefined,
        refs.commitUuid ? isNull(spans.commitUuid) : undefined,
        refs.experimentUuid ? isNull(spans.experimentUuid) : undefined,
        refs.projectId !== undefined ? isNull(spans.projectId) : undefined,
        refs.testDeploymentId !== undefined
          ? isNull(spans.testDeploymentId)
          : undefined,
        refs.source ? isNull(spans.source) : undefined,
      ].filter(Boolean)

      if (missingConditions.length === 0) continue

      const updated = await database
        .update(spans)
        .set(set)
        .where(
          and(
            eq(spans.workspaceId, workspaceId),
            eq(spans.traceId, traceId),
            or(...missingConditions),
          ),
        )
        .returning({ id: spans.id })

      if (updated.length > 0) {
        updatedTraceIds.push(traceId)
      }
    }

    if (updatedTraceIds.length > 0) {
      const subscriptionResult = await findWorkspaceSubscription({ workspace })
      const retentionDays =
        subscriptionResult.ok && subscriptionResult.value
          ? SubscriptionPlans[subscriptionResult.value.plan].retention_period
          : DEFAULT_RETENTION_PERIOD_DAYS
      const retentionExpiresAt = addDays(new Date(), retentionDays)

      const updatedSpans = await database
        .select()
        .from(spans)
        .where(
          and(
            eq(spans.workspaceId, workspaceId),
            inArray(spans.traceId, updatedTraceIds),
          ),
        )

      const rows: SpanRow[] = updatedSpans.map((span) => {
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
          tokens_reasoning: isCompletion
            ? (span.tokensReasoning ?? null)
            : null,
          tokens_completion: isCompletion
            ? (span.tokensCompletion ?? null)
            : null,
          ingested_at: toClickHouseDateTime(new Date()),
          retention_expires_at: toClickHouseDateTime(retentionExpiresAt),
        }
      })

      if (rows.length > 0) {
        const clickhouseInsert = await insertRows(SPANS_TABLE, rows)
        if (clickhouseInsert.error) {
          captureException(
            new LatitudeError(
              'Backfill: span reference clickhouse write failed',
            ),
            {
              workspaceId,
              traceCount: updatedTraceIds.length,
              spansCount: rows.length,
              error: String(clickhouseInsert.error),
            },
          )
          throw clickhouseInsert.error
        }
      }
    }

    const lastTraceId = traceIds[traceIds.length - 1]
    if (lastTraceId) {
      await saveCursor(JOB_NAME, workspaceId, { traceIdCursor: lastTraceId })
    }

    if (traceIds.length === batchSize && lastTraceId) {
      const { maintenanceQueue } = await queues()
      await maintenanceQueue.add(
        JOB_NAME,
        {
          workspaceId,
          batchSize,
          traceIdCursor: lastTraceId,
        },
        { attempts: 3 },
      )

      await logger.done(`Batch complete, re-enqueued from ${lastTraceId}`)
      return
    }

    await clearCursor(JOB_NAME, workspaceId)
    await logger.done(
      `Backfill complete for workspace ${workspaceId} (${traceIds.length} traces in final batch)`,
    )
  } catch (error) {
    await logger.error(`Job failed: ${String(error)}`)
    throw error
  }
}

function extractReferences(
  traceSpans: Array<typeof spans.$inferSelect>,
): TraceReferences {
  const references: TraceReferences = {}

  for (const span of traceSpans) {
    references.documentLogUuid ??= span.documentLogUuid ?? undefined
    references.documentUuid ??= span.documentUuid ?? undefined
    references.commitUuid ??= span.commitUuid ?? undefined
    references.experimentUuid ??= span.experimentUuid ?? undefined
    references.projectId ??= span.projectId ?? undefined
    references.testDeploymentId ??= span.testDeploymentId ?? undefined
    references.source ??= span.source ?? undefined
  }

  return references
}
