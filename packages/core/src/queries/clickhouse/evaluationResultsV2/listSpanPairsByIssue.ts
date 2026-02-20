import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { Cursor } from '../../../schema/types'

interface ListSpanPairsByIssueParams {
  workspaceId: number
  projectId: number
  issueId: number
  commitUuids: string[]
  cursor: Cursor<string, string> | null
  limit: number
}

export const listSpanPairsByIssue = scopedQuery(
  async function listSpanPairsByIssue(
    params: ListSpanPairsByIssueParams,
  ): Promise<{ spanId: string; traceId: string }[]> {
    const { workspaceId, projectId, issueId, commitUuids, cursor, limit } =
      params

    const cursorCondition = cursor
      ? 'AND (evaluated_trace_id, evaluated_span_id) < ({cursorTraceId: String}, {cursorSpanId: String})'
      : ''

    const queryParams: Record<string, unknown> = {
      workspaceId,
      projectId,
      issueId,
      commitUuids,
      limit: limit + 1,
    }

    if (cursor) {
      queryParams.cursorTraceId = cursor.value
      queryParams.cursorSpanId = cursor.id
    }

    const result = await clickhouseClient().query({
      query: `
        SELECT DISTINCT
          evaluated_span_id AS span_id,
          evaluated_trace_id AS trace_id
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND project_id = {projectId: UInt64}
          AND has(issue_ids, {issueId: UInt64})
          AND evaluated_span_id IS NOT NULL
          AND evaluated_trace_id IS NOT NULL
          AND commit_uuid IN ({commitUuids: Array(UUID)})
          ${cursorCondition}
        ORDER BY trace_id DESC, span_id DESC
        LIMIT {limit: UInt64}
      `,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    return result
      .json<{ span_id: string; trace_id: string }>()
      .then((rows) =>
        rows.map((row) => ({ spanId: row.span_id, traceId: row.trace_id })),
      )
  },
)
