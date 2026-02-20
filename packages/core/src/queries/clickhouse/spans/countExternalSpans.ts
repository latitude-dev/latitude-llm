import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { scopedQuery } from '../../scope'

export const countExternalSpans = scopedQuery(
  async function countExternalSpans(
    { workspaceId }: { workspaceId: number },
    _db,
  ) {
    const result = await clickhouseClient().query({
      query: `
      SELECT count() AS cnt
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND type = 'external'
    `,
      format: 'JSONEachRow',
      query_params: { workspaceId },
    })

    const rows = await result.json<{ cnt: string }>()
    return Number(rows[0]?.cnt ?? 0)
  },
)
