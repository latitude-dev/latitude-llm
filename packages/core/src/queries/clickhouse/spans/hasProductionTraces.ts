import {
  MAIN_SPAN_TYPES,
  RUN_SOURCES,
  RunSourceGroup,
} from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'

export async function hasProductionTraces({
  workspaceId,
  projectId,
}: {
  workspaceId: number
  projectId?: number
}) {
  const queryParams: Record<string, unknown> = {
    workspaceId,
    spanTypes: Array.from(MAIN_SPAN_TYPES),
    sources: RUN_SOURCES[RunSourceGroup.Production],
  }

  const projectFilter =
    projectId !== undefined ? 'AND project_id = {projectId: UInt64}' : ''

  if (projectId !== undefined) queryParams.projectId = projectId

  const result = await clickhouseClient().query({
    query: `
      SELECT 1 AS exists
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND type IN ({spanTypes: Array(String)})
        AND source IN ({sources: Array(String)})
        ${projectFilter}
      LIMIT 1
    `,
    format: 'JSONEachRow',
    query_params: queryParams,
  })

  const rows = await result.json<{ exists: number }>()
  return rows.length > 0
}
