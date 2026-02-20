import {
  LogSources,
  MainSpanType,
  Span,
  SpanStatus,
} from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME, SpanRow } from '../../../schema/models/clickhouse/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { scopedQuery } from '../../scope'
import { buildExperimentExclusionCondition } from './buildExperimentExclusionCondition'
import { paginateSpanRows } from './paginateSpanRows'

export const getSpansByDocument = scopedQuery(async function getSpansByDocument(
  {
    workspaceId,
    projectId,
    documentUuid,
    spanTypes,
    commitUuids,
    optimizationExperimentUuids,
    cursor,
    limit,
  }: {
    workspaceId: number
    projectId: number
    documentUuid: string
    spanTypes: MainSpanType[]
    commitUuids: string[]
    optimizationExperimentUuids: string[]
    cursor: { value: Date; id: string } | null
    limit: number
  },
) {
  if (commitUuids.length === 0) {
    return { spans: [] as Span<MainSpanType>[], next: null }
  }

  const params: Record<string, unknown> = {
    workspaceId,
    projectId,
    documentUuid,
    spanTypes,
    commitUuids,
    okStatus: SpanStatus.Ok,
    optimizationSource: LogSources.Optimization,
    experimentSource: LogSources.Experiment,
    fetchLimit: limit + 1,
  }

  const conditions = [
    `workspace_id = {workspaceId: UInt64}`,
    // TODO(clickhouse): remove non-_key predicate after key-column rollout.
    `project_id = {projectId: UInt64}`,
    `project_id_key = {projectId: UInt64}`,
    // TODO(clickhouse): remove non-_key predicate after key-column rollout.
    `document_uuid = {documentUuid: UUID}`,
    `document_uuid_key = {documentUuid: UUID}`,
    `type IN ({spanTypes: Array(String)})`,
    `status = {okStatus: String}`,
    // TODO(clickhouse): remove non-_key predicate after key-column rollout.
    `commit_uuid IN ({commitUuids: Array(UUID)})`,
    `commit_uuid_key IN ({commitUuids: Array(UUID)})`,
    `source != {optimizationSource: String}`,
    buildExperimentExclusionCondition(optimizationExperimentUuids, params),
  ]

  if (cursor) {
    params.cursorStartedAt = toClickHouseDateTime(cursor.value)
    params.cursorId = cursor.id
    conditions.push(
      `(started_at, span_id) < ({cursorStartedAt: DateTime64(6, 'UTC')}, {cursorId: String})`,
    )
  }

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE ${conditions.join(' AND ')}
      ORDER BY started_at DESC, span_id DESC
      LIMIT {fetchLimit: UInt32}
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const rows = await result.json<SpanRow>()
  return paginateSpanRows(rows, limit)
})
