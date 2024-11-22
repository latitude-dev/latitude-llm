import { count, desc, eq, inArray } from 'drizzle-orm'

import type { Project, Span } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib'
import { spans } from '../../schema/models/spans'
import { traces } from '../../schema/models/traces'

export type ListTracesProps = {
  project: Project
  page?: number
  pageSize?: number
}

type TraceWithSpans = {
  traceId: string
  name: string | null
  startTime: Date
  endTime: Date | null
  attributes: Record<string, string | number | boolean> | null
  status: string | null
  spans: Span[]
}

export async function listTraces({
  project,
  page = 1,
  pageSize = 25,
}: ListTracesProps) {
  const where = eq(traces.projectId, project.id)

  // First get the traces
  const [traceResults, total] = await Promise.all([
    database
      .select({
        traceId: traces.traceId,
        name: traces.name,
        startTime: traces.startTime,
        endTime: traces.endTime,
        attributes: traces.attributes,
        status: traces.status,
      })
      .from(traces)
      .where(where)
      .orderBy(desc(traces.startTime))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    database
      .select({ value: count() })
      .from(traces)
      .where(where)
      .then((r) => r[0]?.value ?? 0),
  ])

  // Then get spans for these traces
  const traceIds = traceResults.map((t) => t.traceId)
  const spansResults =
    traceIds.length > 0
      ? await database
          .select()
          .from(spans)
          .where(inArray(spans.traceId, traceIds))
      : []

  // Group spans by traceId
  const spansMap = spansResults.reduce<Record<string, Span[]>>((acc, span) => {
    if (!acc[span.traceId]) {
      acc[span.traceId] = []
    }
    acc[span.traceId]?.push(span)
    return acc
  }, {})

  // Combine traces with their spans
  const tracesWithSpans = traceResults.map((trace) => ({
    ...trace,
    spans: spansMap[trace.traceId] || [],
  }))

  return Result.ok({
    items: tracesWithSpans,
    count: total,
    page,
    pageSize,
  })
}
