import { RUN_SOURCES, RunSourceGroup } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { scopedQuery } from '../../scope'

export const hasProductionTraces = scopedQuery(
  async function hasProductionTraces(
    {
      workspaceId,
      projectId,
    }: {
      workspaceId: number
      projectId?: number
    },
    _db,
  ) {
    const productionSource = RUN_SOURCES[RunSourceGroup.Production][0]! // Production has only one source
    const queryParams: Record<string, unknown> = {
      workspaceId,
      source: productionSource,
    }

    const projectFilter =
      projectId !== undefined
        ? 'AND project_id = {projectId: UInt64} AND project_id_key = {projectId: UInt64}' // TODO(clickhouse): remove non-_key predicate after key-column rollout.
        : ''

    if (projectId !== undefined) queryParams.projectId = projectId

    const result = await clickhouseClient().query({
      query: `
      SELECT 1 AS exists
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND source = {source: String}
        ${projectFilter}
      LIMIT 1
    `,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    const rows = await result.json<{ exists: number }>()
    return rows.length > 0
  },
)
