import { and, eq, inArray, sql, SQL } from 'drizzle-orm'
import { database } from '../../client'
import { RUN_SOURCES, RunSourceGroup, SpanType } from '../../constants'
import { spans } from '../../schema/models/spans'

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
  const conditions: SQL<unknown>[] = [
    eq(spans.workspaceId, workspaceId),
    inArray(spans.type, [SpanType.Prompt, SpanType.External]),
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
