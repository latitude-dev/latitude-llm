import { Span } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME, SpanRow } from '../../../schema/models/clickhouse/spans'
import { Result, TypedResult } from '../../../lib/Result'
import { scopedQuery } from '../../scope'
import { PkFilters, buildPkConditions } from './pkFilters'
import { mapRow } from './toSpan'

export const getByDocumentLogUuidAndSpanId = scopedQuery(
  async function getByDocumentLogUuidAndSpanId({
    workspaceId,
    documentLogUuid,
    spanId,
    ...pkFilters
  }: {
    workspaceId: number
    documentLogUuid: string
    spanId: string
  } & PkFilters): Promise<TypedResult<Span | undefined>> {
    const { conditions: pkConditions, params: pkParams } =
      buildPkConditions(pkFilters)

    const pkWhere =
      pkConditions.length > 0
        ? pkConditions.map((c) => `AND ${c}`).join('\n              ')
        : ''

    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND span_id = {spanId: String}
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
        AND (
          document_log_uuid = {documentLogUuid: UUID}
          OR trace_id IN (
            SELECT DISTINCT trace_id
            FROM ${TABLE_NAME}
            WHERE workspace_id = {workspaceId: UInt64}
              AND document_log_uuid = {documentLogUuid: UUID}
              ${pkWhere}
          )
        )
      ORDER BY ingested_at DESC
      LIMIT 1
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, documentLogUuid, spanId, ...pkParams },
    })

    const rows = await result.json<SpanRow>()
    if (rows.length === 0) return Result.nil()
    return Result.ok(mapRow(rows[0]!))
  },
)
