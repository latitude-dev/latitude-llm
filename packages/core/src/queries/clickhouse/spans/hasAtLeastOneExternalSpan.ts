import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'

/**
 * Returns true if the workspace has at least one span of type External (ICP check).
 * Uses ClickHouse; count-only, no span rows fetched.
 */
export async function hasAtLeastOneExternalSpan(
  workspaceId: number,
): Promise<boolean> {
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
  return Number(rows[0]?.cnt ?? 0) >= 1
}
