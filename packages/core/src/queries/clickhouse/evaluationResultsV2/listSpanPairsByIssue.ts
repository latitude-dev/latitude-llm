import { and, eq } from 'drizzle-orm'
import { clickhouseClient } from '../../../client/clickhouse'
import { EVALUATION_RESULTS_TABLE } from '../../../schema/models/clickhouse/evaluationResults'
import { issueEvaluationResults } from '../../../schema/models/issueEvaluationResults'
import { Cursor } from '../../../schema/types'
import { scopedQuery } from '../../scope'

export const listSpanPairsByIssue = scopedQuery(
  async function listSpanPairsByIssue(
    {
      workspaceId,
      projectId,
      issueId,
      commitUuids,
      cursor,
      limit,
    }: {
      workspaceId: number
      projectId: number
      issueId: number
      commitUuids: string[]
      cursor: Cursor<string, string> | null
      limit: number
    },
    db,
  ): Promise<{ spanId: string; traceId: string }[]> {
    if (commitUuids.length === 0) return []

    const rows = await db
      .select({ evaluationResultId: issueEvaluationResults.evaluationResultId })
      .from(issueEvaluationResults)
      .where(
        and(
          eq(issueEvaluationResults.workspaceId, workspaceId),
          eq(issueEvaluationResults.issueId, issueId),
        ),
      )

    if (rows.length === 0) return []

    const evaluationResultIds = rows.map((r) => r.evaluationResultId)

    const params: Record<string, unknown> = {
      workspaceId,
      projectId,
      commitUuids,
      evaluationResultIds,
      fetchLimit: limit + 1,
    }

    const conditions = [
      `workspace_id = {workspaceId: UInt64}`,
      `project_id = {projectId: UInt64}`,
      `commit_uuid IN ({commitUuids: Array(UUID)})`,
      `id IN ({evaluationResultIds: Array(UInt64)})`,
      `evaluated_span_id IS NOT NULL`,
      `evaluated_trace_id IS NOT NULL`,
    ]

    if (cursor) {
      params.cursorTraceId = cursor.value
      params.cursorSpanId = cursor.id
      conditions.push(
        `(evaluated_trace_id, evaluated_span_id) < ({cursorTraceId: String}, {cursorSpanId: String})`,
      )
    }

    const result = await clickhouseClient().query({
      query: `
        SELECT DISTINCT
          evaluated_span_id,
          evaluated_trace_id
        FROM ${EVALUATION_RESULTS_TABLE}
        WHERE ${conditions.join(' AND ')}
        ORDER BY evaluated_trace_id DESC, evaluated_span_id DESC
        LIMIT {fetchLimit: UInt32}
      `,
      format: 'JSONEachRow',
      query_params: params,
    })

    const chRows = await result.json<{
      evaluated_span_id: string
      evaluated_trace_id: string
    }>()

    return chRows.map((row) => ({
      spanId: row.evaluated_span_id,
      traceId: row.evaluated_trace_id,
    }))
  },
)
