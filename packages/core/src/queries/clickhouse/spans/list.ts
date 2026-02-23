import { Span } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME, SpanRow } from '../../../schema/models/clickhouse/spans'
import { Result, TypedResult } from '../../../lib/Result'
import { scopedQuery } from '../../scope'
import { PkFilters, buildPkConditions } from './pkFilters'
import { mapRow } from './toSpan'

export const findSpans = scopedQuery(async function findSpans({
  workspaceId,
  traceId,
  ...pkFilters
}: {
  workspaceId: number
  traceId: string
} & PkFilters): Promise<TypedResult<Span[]>> {
  const { conditions: pkConditions, params: pkParams } =
    buildPkConditions(pkFilters)

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${TABLE_NAME} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND trace_id = {traceId: String}
        ${pkConditions.map((c) => `AND ${c}`).join('\n        ')}
      ORDER BY started_at ASC, span_id ASC
    `,
    format: 'JSONEachRow',
    query_params: { workspaceId, traceId, ...pkParams },
  })

  const rows = await result.json<SpanRow>()
  return Result.ok(rows.map(mapRow))
})
