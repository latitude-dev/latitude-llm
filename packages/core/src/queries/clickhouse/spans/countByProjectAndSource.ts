import { LogSources } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { scopedQuery } from '../../scope'

export const countByProjectAndSource = scopedQuery(
  async function countByProjectAndSource(
    {
      workspaceId,
      projectId,
      source,
    }: {
      workspaceId: number
      projectId: number
      source?: LogSources[]
    },
    _db,
  ): Promise<Record<LogSources, number>> {
    const sourcesToCount = source ?? Object.values(LogSources)
    const countsBySource: Record<LogSources, number> = {} as Record<
      LogSources,
      number
    >

    const result = await clickhouseClient().query({
      query: `
      SELECT source, count() AS cnt
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND project_id = {projectId: UInt64}
        AND project_id_key = {projectId: UInt64}
        AND source IN ({sources: Array(String)})
      GROUP BY source
    `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        projectId,
        sources: sourcesToCount,
      },
    })

    const rows = await result.json<{ source: string; cnt: string }>()

    for (const s of sourcesToCount) {
      countsBySource[s] = 0
    }

    for (const row of rows) {
      const key = row.source as LogSources
      if (key in countsBySource) {
        countsBySource[key] = Number(row.cnt)
      }
    }

    return countsBySource
  },
)
