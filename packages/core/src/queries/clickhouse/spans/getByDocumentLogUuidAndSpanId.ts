import { Span } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE, SpanRow } from '../../../clickhouse/models/spans'
import { Result, TypedResult } from '../../../lib/Result'
import { scopedQuery } from '../../scope'
import { spanRowToSpan } from './toSpan'

export const getByDocumentLogUuidAndSpanId = scopedQuery(
  async function getByDocumentLogUuidAndSpanId(
    {
      workspaceId,
      documentLogUuid,
      spanId,
    }: {
      workspaceId: number
      documentLogUuid: string
      spanId: string
    },
    _db,
  ): Promise<TypedResult<Span | undefined>> {
    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_log_uuid = {documentLogUuid: UUID}
        AND span_id = {spanId: String}
      ORDER BY ingested_at DESC
      LIMIT 1
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId, documentLogUuid, spanId },
    })

    const rows = await result.json<SpanRow>()
    if (rows.length === 0) return Result.nil()
    return Result.ok(spanRowToSpan(rows[0]!))
  },
)
