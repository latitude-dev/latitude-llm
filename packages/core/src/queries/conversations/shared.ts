import { sql } from 'drizzle-orm'
import { LogSources } from '@latitude-data/constants'
import { spans } from '../../schema/models/spans'

export const traceAggregateFields = {
  documentLogUuid: spans.documentLogUuid,
  traceId: spans.traceId,
  traceDuration:
    sql<number>`COALESCE(EXTRACT(EPOCH FROM (MAX(${spans.endedAt}) - MIN(${spans.startedAt}))) * 1000, 0)`
      .mapWith(Number)
      .as('trace_duration'),
  traceTokens:
    sql<number>`COALESCE(SUM(COALESCE(${spans.tokensPrompt}, 0) + COALESCE(${spans.tokensCached}, 0) + COALESCE(${spans.tokensReasoning}, 0) + COALESCE(${spans.tokensCompletion}, 0)), 0)`
      .mapWith(Number)
      .as('trace_tokens'),
  traceCost: sql<number>`COALESCE(SUM(${spans.cost}), 0)`
    .mapWith(Number)
    .as('trace_cost'),
  traceStartedAt: sql<string>`MIN(${spans.startedAt})`.as('trace_started_at'),
  traceEndedAt: sql<string>`MAX(${spans.endedAt})`.as('trace_ended_at'),
  documentUuid: sql<
    string | null
  >`(array_agg(${spans.documentUuid} ORDER BY ${spans.startedAt} DESC) FILTER (WHERE ${spans.documentUuid} IS NOT NULL))[1]`.as(
    'document_uuid',
  ),
  source:
    sql<LogSources | null>`(array_agg(${spans.source} ORDER BY ${spans.startedAt} DESC) FILTER (WHERE ${spans.source} IS NOT NULL))[1]`.as(
      'source',
    ),
  commitUuid:
    sql<string>`(array_agg(${spans.commitUuid} ORDER BY ${spans.startedAt} DESC) FILTER (WHERE ${spans.commitUuid} IS NOT NULL))[1]`.as(
      'commit_uuid',
    ),
  experimentUuid: sql<
    string | null
  >`(array_agg(${spans.experimentUuid} ORDER BY ${spans.startedAt} DESC) FILTER (WHERE ${spans.experimentUuid} IS NOT NULL))[1]`.as(
    'experiment_uuid',
  ),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TracesSubquery = Record<string, any>

export function buildConversationAggregateFields(traces: TracesSubquery) {
  return {
    documentLogUuid: traces.documentLogUuid,
    documentUuid: sql<
      string | null
    >`(array_agg(${traces.documentUuid} ORDER BY ${traces.traceStartedAt} DESC) FILTER (WHERE ${traces.documentUuid} IS NOT NULL))[1]`.as(
      'document_uuid',
    ),
    traceIds: sql<
      string[]
    >`array_agg(DISTINCT ${traces.traceId} ORDER BY ${traces.traceId})`.as(
      'trace_ids',
    ),
    traceCount: sql<number>`COUNT(*)`.mapWith(Number).as('trace_count'),
    totalTokens: sql<number>`COALESCE(SUM(${traces.traceTokens}), 0)`
      .mapWith(Number)
      .as('total_tokens'),
    totalDuration: sql<number>`COALESCE(SUM(${traces.traceDuration}), 0)`
      .mapWith(Number)
      .as('total_duration'),
    totalCost: sql<number>`COALESCE(SUM(${traces.traceCost}), 0)`
      .mapWith(Number)
      .as('total_cost'),
    startedAt: sql<string>`MIN(${traces.traceStartedAt})`.as('started_at'),
    endedAt: sql<string>`MAX(${traces.traceEndedAt})`.as('ended_at'),
    latestStartedAt: sql<string>`MAX(${traces.traceStartedAt})`.as(
      'latest_started_at',
    ),
    source:
      sql<LogSources | null>`(array_agg(${traces.source} ORDER BY ${traces.traceStartedAt} DESC) FILTER (WHERE ${traces.source} IS NOT NULL))[1]`.as(
        'latest_source',
      ),
    commitUuid:
      sql<string>`(array_agg(${traces.commitUuid} ORDER BY ${traces.traceStartedAt} DESC) FILTER (WHERE ${traces.commitUuid} IS NOT NULL))[1]`.as(
        'latest_commit_uuid',
      ),
    experimentUuid: sql<
      string | null
    >`(array_agg(${traces.experimentUuid} ORDER BY ${traces.traceStartedAt} DESC) FILTER (WHERE ${traces.experimentUuid} IS NOT NULL))[1]`.as(
      'latest_experiment_uuid',
    ),
  }
}
