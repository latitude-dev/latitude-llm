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
    // Transitional resilience: some historical non-main spans were ingested with
    // NULL document_log_uuid. Prefer direct document_log_uuid matching, but also
    // allow spans whose trace belongs to the conversation until backfill is complete.
    const result = await clickhouseClient().query({
      query: `
      SELECT *
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND span_id = {spanId: String}
        AND (
          document_log_uuid = {documentLogUuid: UUID}
          OR trace_id IN (
            SELECT DISTINCT trace_id
            FROM ${SPANS_TABLE}
            WHERE workspace_id = {workspaceId: UInt64}
              AND document_log_uuid = {documentLogUuid: UUID}
          )
        )
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
