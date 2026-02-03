import { sql } from 'drizzle-orm'
import { LogSources, SpanType } from '@latitude-data/constants'
import { spans } from '../../schema/models/spans'

const MAIN_SPAN_TYPE_VALUES = [
  SpanType.Prompt,
  SpanType.Chat,
  SpanType.External,
]

export const conversationAggregateFields = {
  documentLogUuid: sql<
    string | null
  >`(array_agg(${spans.documentLogUuid} ORDER BY ${spans.startedAt} DESC) FILTER (WHERE ${spans.documentLogUuid} IS NOT NULL))[1]`.as(
    'document_log_uuid',
  ),
  traceIds: sql<
    string[]
  >`array_agg(DISTINCT ${spans.traceId} ORDER BY ${spans.traceId})`.as(
    'trace_ids',
  ),
  traceCount: sql<number>`COUNT(DISTINCT ${spans.traceId})`
    .mapWith(Number)
    .as('trace_count'),
  totalTokens:
    sql<number>`COALESCE(SUM(COALESCE(${spans.tokensPrompt}, 0) + COALESCE(${spans.tokensCached}, 0) + COALESCE(${spans.tokensReasoning}, 0) + COALESCE(${spans.tokensCompletion}, 0)), 0)`
      .mapWith(Number)
      .as('total_tokens'),
  totalDuration:
    sql<number>`COALESCE(SUM(${spans.duration}) FILTER (WHERE ${spans.type} IN (${sql.join(MAIN_SPAN_TYPE_VALUES, sql`, `)})), 0)`
      .mapWith(Number)
      .as('total_duration'),
  totalCost: sql<number>`COALESCE(SUM(${spans.cost}), 0)`
    .mapWith(Number)
    .as('total_cost'),
  startedAt: sql<string>`MIN(${spans.startedAt})`.as('started_at'),
  endedAt: sql<string>`MAX(${spans.endedAt})`.as('ended_at'),
  latestStartedAt: sql<string>`MAX(${spans.startedAt})`.as('latest_started_at'),
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
