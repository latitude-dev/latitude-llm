import { subWeeks } from 'date-fns'

const DEFAULT_SPANS_WINDOW_WEEKS = 8

export type CreatedAtRange = { from?: Date; to?: Date }

export function normalizeCreatedAtRange(
  createdAt?: CreatedAtRange,
): CreatedAtRange | undefined {
  if (!createdAt?.from && !createdAt?.to) return undefined
  return createdAt
}

/**
 * Returns the default createdAt range applied to spans queries when no explicit
 * filters are provided (e.g. first page of pagination).
 */
export function getDefaultSpansCreatedAtRange(): CreatedAtRange {
  return { from: subWeeks(new Date(), DEFAULT_SPANS_WINDOW_WEEKS) }
}

/**
 * Applies the default createdAt range only for first-page queries (no cursor)
 * when the caller didn't provide a createdAt filter.
 */
export function applyDefaultSpansCreatedAtRange({
  createdAt,
  hasCursor,
}: {
  createdAt?: CreatedAtRange
  hasCursor: boolean
}): CreatedAtRange | undefined {
  if (hasCursor) return createdAt
  if (createdAt) return createdAt
  return getDefaultSpansCreatedAtRange()
}

/**
 * Determines if the query should fall back to all-time when the first page
 * with the default window returned no results.
 */
export function shouldFallbackToAllTime({
  hasCursor,
  normalizedCreatedAt,
  itemCount,
}: {
  hasCursor: boolean
  normalizedCreatedAt: CreatedAtRange | undefined
  itemCount: number
}): boolean {
  return !hasCursor && normalizedCreatedAt === undefined && itemCount === 0
}

