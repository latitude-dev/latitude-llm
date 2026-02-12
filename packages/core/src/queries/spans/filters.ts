import {
  between,
  eq,
  inArray,
  isNull,
  gte,
  lte,
  or,
  SQL,
} from 'drizzle-orm'

import { LogSources, SpanType } from '../../constants'
import { spans } from '../../schema/models/spans'

export const tenancyFilter = (workspaceId: number) =>
  eq(spans.workspaceId, workspaceId)

export function buildSpanFilterConditions({
  workspaceId,
  types,
  source,
  experimentUuids,
  createdAt,
}: {
  workspaceId: number
  types?: SpanType[]
  source?: LogSources[]
  experimentUuids?: string[]
  createdAt?: { from?: Date; to?: Date }
}): SQL<unknown>[] {
  const conditions = [
    tenancyFilter(workspaceId),
    types ? inArray(spans.type, types) : undefined,
    source
      ? or(inArray(spans.source, source), isNull(spans.source))
      : undefined,
  ].filter(Boolean) as SQL<unknown>[]

  if (createdAt?.from && createdAt?.to) {
    conditions.push(between(spans.startedAt, createdAt.from, createdAt.to))
  } else if (createdAt?.from) {
    conditions.push(gte(spans.startedAt, createdAt.from))
  } else if (createdAt?.to) {
    conditions.push(lte(spans.startedAt, createdAt.to))
  }

  if (experimentUuids && experimentUuids.length > 0) {
    conditions.push(inArray(spans.experimentUuid, experimentUuids))
  }

  return conditions
}
