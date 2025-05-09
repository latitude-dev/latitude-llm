import {
  count,
  desc,
  inArray,
  eq,
  lt,
  gt,
  ne,
  like,
  notLike,
  exists,
  and,
  SQL,
} from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { SearchFilter, Span, Workspace } from '../../browser'
import { database } from '../../client'
import { spans } from '../../schema/models/spans'
import { traces } from '../../schema/models/traces'
import { BadRequestError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'

export type ListTracesProps = {
  workspace: Workspace
  page?: number
  pageSize?: number
  filters?: SearchFilter[]
}

export type ListTracesResponse = {
  items: Array<{
    workspaceId: number
    traceId: string
    name: string | null
    startTime: Date
    endTime: Date | null
    attributes: Record<string, unknown> | null
    status: string | null
    spans: Span[]
    realtimeAdded?: boolean
  }>
  count: number
  page: number
  pageSize: number
  filters?: SearchFilter[]
}

export async function listTraces({
  workspace,
  page = 1,
  pageSize = 25,
  filters = [],
}: ListTracesProps): Promise<TypedResult<ListTracesResponse, Error>> {
  let where
  try {
    where = buildWhereClause({ filters, workspace })
  } catch (e) {
    where = eq(traces.workspaceId, -1) // falsy condition to return no results
  }

  // First get the traces
  const [traceResults, total] = await Promise.all([
    database
      .select({
        workspaceId: traces.workspaceId,
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

function buildSpanCondition(
  field: keyof typeof spans.$inferSelect,
  operator: string,
  value: string,
) {
  let fieldCondition: SQL<unknown>

  switch (operator) {
    case 'eq':
      fieldCondition = eq(spans[field], value)
      break
    case 'neq':
      fieldCondition = ne(spans[field], value)
      break
    case 'contains':
      fieldCondition = like(spans[field], `%${value}%`)
      break
    case 'not_contains':
      fieldCondition = notLike(spans[field], `%${value}%`)
      break
    default:
      throw new Error(`Unsupported operator ${operator} for field ${field}`)
  }

  const subquery = database
    .select()
    .from(spans)
    .where(and(eq(spans.traceId, traces.traceId), fieldCondition))

  return exists(subquery)
}

function buildDateCondition(
  field: PgColumn<any>,
  operator: string,
  value: string,
) {
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    throw new BadRequestError(
      `Invalid date value: ${value}. Expected value should be ISO compatible, e.g: YYYY-MM-DD`,
    )
  }

  switch (operator) {
    case 'eq':
      return eq(field, date)
    case 'lt':
      return lt(field, date)
    case 'gt':
      return gt(field, date)
    default:
      throw new Error(`Unsupported operator ${operator} for date field`)
  }
}

function buildStringCondition(
  field: PgColumn<any>,
  operator: string,
  value: string,
) {
  switch (operator) {
    case 'eq':
      return eq(field, value)
    case 'neq':
      return ne(field, value)
    case 'contains':
      return like(field, `%${value}%`)
    case 'not_contains':
      return notLike(field, `%${value}%`)
    default:
      throw new Error(`Unsupported operator ${operator} for string field`)
  }
}

function buildWhereClause({
  filters = [],
  workspace,
}: {
  filters?: SearchFilter[]
  workspace: Workspace
}) {
  const conditions = [eq(traces.workspaceId, workspace.id)]

  filters?.forEach((filter) => {
    switch (filter.field) {
      case 'startTime':
        conditions.push(
          buildDateCondition(traces.startTime, filter.operator, filter.value),
        )
        break
      case 'endTime':
        conditions.push(
          buildDateCondition(traces.endTime, filter.operator, filter.value),
        )
        break
      case 'name':
        conditions.push(
          buildStringCondition(
            traces[filter.field],
            filter.operator,
            filter.value,
          ),
        )
        break
      case 'traceId':
        conditions.push(
          buildStringCondition(traces.traceId, filter.operator, filter.value),
        )
        break
      case 'spans.model':
      case 'spans.distinctId':
      case 'spans.commitUuid':
      case 'spans.documentUuid': {
        const field = filter.field.replace(
          'spans.',
          '',
        ) as keyof typeof spans.$inferSelect

        conditions.push(
          buildSpanCondition(field, filter.operator, filter.value),
        )
        break
      }
    }
  })

  return and(...conditions)
}
