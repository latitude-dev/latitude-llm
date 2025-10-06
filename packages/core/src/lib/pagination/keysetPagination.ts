import { Buffer } from 'buffer'

export interface KeysetCursor {
  id: number
  createdAt: string | Date
}

export interface KeysetPaginationParams {
  after?: string
  before?: string
  limit?: number
}

export interface KeysetPaginationResult<T> {
  data: T[]
  hasNext: boolean
  hasPrevious: boolean
  nextCursor?: string
  previousCursor?: string
}

/**
 * Encodes a cursor for keyset pagination
 * Uses base64 encoding to create an opaque cursor string
 */
export function encodeCursor(cursor: KeysetCursor): string {
  const cursorData = JSON.stringify({
    id: cursor.id,
    createdAt: cursor.createdAt,
  })
  return Buffer.from(cursorData).toString('base64')
}

/**
 * Decodes a cursor from keyset pagination
 * Returns null if the cursor is invalid or malformed
 */
export function decodeCursor(cursorString: string): KeysetCursor | null {
  try {
    const cursorData = Buffer.from(cursorString, 'base64').toString()
    const parsed = JSON.parse(cursorData)

    if (!parsed.id || !parsed.createdAt) {
      return null
    }

    return {
      id: Number(parsed.id),
      createdAt: String(parsed.createdAt),
    }
  } catch {
    return null
  }
}

/**
 * Creates SQL conditions for keyset pagination
 * Handles both forward and backward pagination
 */
export function buildKeysetConditions({
  after,
  before,
  idColumn,
  createdAtColumn,
  sortDirection = 'desc',
}: {
  after?: KeysetCursor
  before?: KeysetCursor
  idColumn: string
  createdAtColumn: string
  sortDirection?: 'asc' | 'desc'
}) {
  const conditions: string[] = []

  if (after) {
    // For forward pagination, we want items that come "after" the cursor
    // Since we sort by createdAt DESC, "after" means earlier timestamps
    if (sortDirection === 'desc') {
      conditions.push(
        `(${createdAtColumn} < '${after.createdAt}' OR (${createdAtColumn} = '${after.createdAt}' AND ${idColumn} < ${after.id}))`,
      )
    } else {
      conditions.push(
        `(${createdAtColumn} > '${after.createdAt}' OR (${createdAtColumn} = '${after.createdAt}' AND ${idColumn} > ${after.id}))`,
      )
    }
  }

  if (before) {
    // For backward pagination, we want items that come "before" the cursor
    // Since we sort by createdAt DESC, "before" means later timestamps
    if (sortDirection === 'desc') {
      conditions.push(
        `(${createdAtColumn} > '${before.createdAt}' OR (${createdAtColumn} = '${before.createdAt}' AND ${idColumn} > ${before.id}))`,
      )
    } else {
      conditions.push(
        `(${createdAtColumn} < '${before.createdAt}' OR (${createdAtColumn} = '${before.createdAt}' AND ${idColumn} < ${before.id}))`,
      )
    }
  }

  return conditions.length > 0 ? `(${conditions.join(' AND ')})` : undefined
}

/**
 * Builds the ORDER BY clause for keyset pagination
 * Ensures consistent ordering for cursor-based navigation
 */
export function buildKeysetOrderBy({
  createdAtColumn,
  idColumn,
  sortDirection = 'desc',
}: {
  createdAtColumn: string
  idColumn: string
  sortDirection?: 'asc' | 'desc'
}) {
  const orderBy: string[] = []

  if (sortDirection === 'desc') {
    orderBy.push(`${createdAtColumn} DESC`)
    orderBy.push(`${idColumn} DESC`)
  } else {
    orderBy.push(`${createdAtColumn} ASC`)
    orderBy.push(`${idColumn} ASC`)
  }

  return orderBy.join(', ')
}

/**
 * Processes query results to extract cursors for next/previous navigation
 */
export function processKeysetResults<
  T extends { id: number; createdAt: string | Date },
>({
  data,
  limit,
  after,
  before,
}: {
  data: T[]
  limit: number
  after?: KeysetCursor
  before?: KeysetCursor
}): KeysetPaginationResult<T> {
  // If we got more results than the limit, we have a next page
  const hasExtra = data.length > limit

  // Remove the extra item if present (used for pagination detection)
  const trimmedData = hasExtra ? data.slice(0, limit) : data

  // Determine if we have next/previous pages
  const hasNext = hasExtra || Boolean(before) // If we came from a previous page, we can go forward
  const hasPrevious = Boolean(after) || (before && trimmedData.length > 0) // If we came from a next page or have data

  // Generate cursors for next/previous navigation
  let nextCursor: string | undefined
  let previousCursor: string | undefined

  if (trimmedData.length > 0) {
    // Next cursor is based on the last item (for forward pagination)
    if (hasNext) {
      const lastItem = trimmedData[trimmedData.length - 1]
      nextCursor = encodeCursor({
        id: lastItem.id,
        createdAt: lastItem.createdAt,
      })
    }

    // Previous cursor is based on the first item (for backward pagination)
    if (hasPrevious) {
      const firstItem = trimmedData[0]
      previousCursor = encodeCursor({
        id: firstItem.id,
        createdAt: firstItem.createdAt,
      })
    }
  }

  return {
    data: trimmedData,
    hasNext,
    hasPrevious,
    nextCursor,
    previousCursor,
  }
}

/**
 * Gets the limit for keyset pagination (adds 1 to detect if there's a next page)
 */
export function getKeysetLimit(limit: number = 20): number {
  return limit + 1
}
