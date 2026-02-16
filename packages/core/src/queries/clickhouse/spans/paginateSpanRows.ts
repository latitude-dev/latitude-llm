import { MainSpanType, Span } from '@latitude-data/constants'
import { SpanRow } from '../../../clickhouse/models/spans'
import { spanRowToSpan } from './toSpan'

export function paginateSpanRows(rows: SpanRow[], limit: number) {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const spans = items.map((row) => spanRowToSpan(row) as Span<MainSpanType>)

  const lastItem = spans.length > 0 ? spans[spans.length - 1] : null
  const next =
    hasMore && lastItem
      ? {
          value: lastItem.startedAt,
          id: lastItem.id,
        }
      : null

  return { spans, next }
}
