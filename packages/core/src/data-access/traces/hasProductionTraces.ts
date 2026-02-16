import { and, eq, inArray, sql, SQL } from 'drizzle-orm'
import { database } from '../../client'
import { MAIN_SPAN_TYPES, RUN_SOURCES, RunSourceGroup } from '../../constants'
import { spans } from '../../schema/models/spans'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { hasProductionTraces as chHasProductionTraces } from '../../queries/clickhouse/spans/hasProductionTraces'

const CLICKHOUSE_SPANS_READ_FLAG = 'clickhouse-spans-read'

export async function hasProductionTraces(
  {
    workspaceId,
    projectId,
  }: {
    workspaceId: number
    projectId?: number
  },
  db = database,
): Promise<boolean> {
  const clickhouseEnabledResult = await isFeatureEnabledByName(
    workspaceId,
    CLICKHOUSE_SPANS_READ_FLAG,
    db,
  )
  const shouldUseClickHouse =
    clickhouseEnabledResult.ok && clickhouseEnabledResult.value

  if (shouldUseClickHouse) {
    return chHasProductionTraces({ workspaceId, projectId })
  }

  const conditions: SQL<unknown>[] = [
    eq(spans.workspaceId, workspaceId),
    inArray(spans.type, Array.from(MAIN_SPAN_TYPES)),
    inArray(spans.source, RUN_SOURCES[RunSourceGroup.Production]),
  ]

  if (projectId !== undefined) {
    conditions.push(eq(spans.projectId, projectId))
  }

  const result = await db
    .select({ exists: sql<number>`1` })
    .from(spans)
    .where(and(...conditions))
    .limit(1)

  return result.length > 0
}
