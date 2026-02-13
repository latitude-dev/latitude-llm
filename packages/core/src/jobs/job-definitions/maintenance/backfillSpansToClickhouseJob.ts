import { Job } from 'bullmq'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { addDays, subDays } from 'date-fns'
import { database } from '../../../client'
import { toClickHouseDateTime, insertRows } from '../../../clickhouse/insert'
import { SpanRow, SPANS_TABLE } from '../../../clickhouse/models/spans'
import { spans } from '../../../schema/models/spans'
import { SpanType } from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { findWorkspaceSubscription } from '../../../services/subscriptions/data-access/find'
import {
  DEFAULT_RETENTION_PERIOD_DAYS,
  SubscriptionPlans,
} from '../../../plans'
import { queues } from '../../queues'
import { captureException } from '../../../utils/datadogCapture'
import { LatitudeError } from '../../../lib/errors'

export type BackfillSpansToClickhouseJobData = {
  workspaceId: number
  batchSize?: number
  startedAtCursor?: string
  spanIdCursor?: string
}

const DEFAULT_BATCH_SIZE = 1000
const BACKFILL_LOOKBACK_DAYS = 30

export async function backfillSpansToClickhouseJob(
  job: Job<BackfillSpansToClickhouseJobData>,
) {
  const {
    workspaceId,
    batchSize = DEFAULT_BATCH_SIZE,
    startedAtCursor,
    spanIdCursor,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return

  const subscriptionResult = await findWorkspaceSubscription({ workspace })
  const retentionDays =
    subscriptionResult.ok && subscriptionResult.value
      ? SubscriptionPlans[subscriptionResult.value.plan].retention_period
      : DEFAULT_RETENTION_PERIOD_DAYS
  const retentionExpiresAt = addDays(new Date(), retentionDays)

  const yesterday = new Date('2026-02-12T00:00:00.000Z')
  const lookbackStart = subDays(yesterday, BACKFILL_LOOKBACK_DAYS)

  const conditions = [
    eq(spans.workspaceId, workspaceId),
    gte(spans.startedAt, lookbackStart),
    lt(spans.startedAt, yesterday),
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

  if (batch.length === 0) return

  const rows: SpanRow[] = batch.map((span) => {
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

  const result = await insertRows(SPANS_TABLE, rows)
  if (result.error) {
    captureException(
      new LatitudeError('Backfill: ClickHouse span insertion failed'),
      { workspaceId, batchSize, error: String(result.error) },
    )
    throw result.error
  }

  if (batch.length === batchSize) {
    const lastSpan = batch[batch.length - 1]!
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'backfillSpansToClickhouseJob',
      {
        workspaceId,
        batchSize,
        startedAtCursor: lastSpan.startedAt.toISOString(),
        spanIdCursor: lastSpan.id,
      },
      { attempts: 3 },
    )
  }
}
