import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'

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
    FROM ${TABLE_NAME}
    WHERE workspace_id = {workspaceId: UInt64}
      AND type = 'external'
  `,
    format: 'JSONEachRow',
    query_params: { workspaceId },
  })

  const rows = await result.json<{ cnt: string }>()
  return Number(rows[0]?.cnt ?? 0) >= 1
}
