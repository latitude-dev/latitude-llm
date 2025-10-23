import { deflateSync, inflateSync } from 'zlib'
import { sql, SQL } from 'drizzle-orm'
import { IssueSort, SafeIssuesParams } from '@latitude-data/constants/issues'
import { Issue } from '../../schema/models/types/Issue'
import { issues } from '../../schema/models/issues'
import { HISTOGRAM_SUBQUERY_ALIAS } from '../../repositories/issueHistogramsRepository'

type IssueWithStats = Issue & {
  last7DaysCount: number
  lastSeenDate: Date
}

type SortDirection = SafeIssuesParams['sorting']['sortDirection']

type CursorPayload = {
  sort: IssueSort
  sortDirection: SortDirection
  values: {
    id: number
    last7DaysCount?: number
    lastSeenDate?: Date
    createdAt?: Date
  }
}

/**
 * Builds cursor-based pagination conditions and cursors for issues
 * based on the selected sort and sort direction.
 */
export class IssuesCusrorBuilder {
  private sort: IssueSort
  private sortDirection: SortDirection
  private decoded: CursorPayload | null

  constructor({
    sort,
    sortDirection,
    cursor,
  }: {
    sort: IssueSort
    sortDirection: SortDirection
    cursor?: string | null
  }) {
    this.sort = sort
    this.sortDirection = sortDirection
    this.decoded = this.parse(cursor)
  }

  get whereCondition(): SQL | undefined {
    if (!this.decoded) return undefined

    const cursor = this.decoded
    const subquery = HISTOGRAM_SUBQUERY_ALIAS
    const comparator = this.sortDirection === 'desc' ? '<' : '>'
    const { values } = cursor

    switch (this.sort) {
      case 'relevance':
        return sql`(
          COALESCE(${sql.raw(`${subquery}."last7DaysCount"`)}, 0),
          ${sql.raw(`${subquery}."lastSeenDate"`)},
          ${issues.id}
        ) ${sql.raw(comparator)} (
          ${values.last7DaysCount ?? 0},
          ${values.lastSeenDate ?? null},
          ${values.id}
        )`

      case 'lastSeen':
        return sql`(
          ${sql.raw(`${subquery}."lastSeenDate"`)},
          ${issues.id}
        ) ${sql.raw(comparator)} (
          ${values.lastSeenDate ?? null},
          ${values.id}
        )`

      case 'firstSeen':
        return sql`(
          ${issues.createdAt},
          ${issues.id}
        ) ${sql.raw(comparator)} (
          ${values.createdAt ?? null},
          ${values.id}
        )`

      default:
        return sql`${issues.id} ${sql.raw(comparator)} ${values.id}`
    }
  }

  buildCursors({
    results,
    limit,
  }: {
    results: IssueWithStats[]
    limit: number
  }) {
    const nextCursor = this.buildNextCursor({ results, limit })
    const prevCursor = this.buildPrevCursor({ results, nextCursor })

    return { prevCursor, nextCursor }
  }

  private buildPrevCursor({
    results,
    nextCursor,
  }: {
    results: IssueWithStats[]
    nextCursor: string | null
  }): string | null {
    if (!nextCursor) return null // no prev page

    const firstRow = results[0]
    if (!firstRow) return null

    return this.encode(this.extractPayload(firstRow))
  }

  /**
   * Build next cursor if there are more results
   * it encodes the necessary values from the last row
   */
  private buildNextCursor({
    results,
    limit,
  }: {
    results: IssueWithStats[]
    limit: number
  }) {
    const hasMore = results.length > limit
    if (!hasMore) return null

    const lastRow = results[limit - 1]
    if (!lastRow) return null

    const payload: CursorPayload = this.extractPayload(lastRow)
    return this.encode(payload)
  }

  private extractPayload(lastRow: IssueWithStats): CursorPayload {
    switch (this.sort) {
      case 'relevance':
        return {
          sort: this.sort,
          sortDirection: this.sortDirection,
          values: {
            id: lastRow.id,
            last7DaysCount: lastRow.last7DaysCount,
            lastSeenDate: lastRow.lastSeenDate,
          },
        }
      case 'lastSeen':
        return {
          sort: this.sort,
          sortDirection: this.sortDirection,
          values: {
            id: lastRow.id,
            lastSeenDate: lastRow.lastSeenDate,
          },
        }
      case 'firstSeen':
        return {
          sort: this.sort,
          sortDirection: this.sortDirection,
          values: {
            id: lastRow.id,
            createdAt: lastRow.createdAt,
          },
        }
      default:
        return {
          sort: this.sort,
          sortDirection: this.sortDirection,
          values: { id: lastRow.id },
        }
    }
  }

  private parse(cursor?: string | null): CursorPayload | null {
    const decoded = this.decode(cursor)
    if (!decoded) return null

    return this.validate(decoded)
  }

  /**
   * Compress and Base64URL-encode a JSON object.
   * Short url-friendly representation of the cursor.
   */
  private encode<T extends object>(data: T | null): string | null {
    if (!data) return null

    try {
      const json = JSON.stringify(data)
      const compressed = deflateSync(Buffer.from(json))
      return compressed.toString('base64url')
    } catch {
      return null
    }
  }

  /**
   * Decode and decompress a previously encoded cursor.
   */
  private decode(encoded?: string | null): CursorPayload | null {
    if (!encoded) return null
    try {
      const compressed = Buffer.from(encoded, 'base64url')
      const json = inflateSync(compressed).toString('utf-8')
      return JSON.parse(json) as CursorPayload
    } catch {
      return null
    }
  }

  /**
   * If the cursor's sort or sortDirection do not match the current ones,
   * invalidate it. Does not check the values.
   */
  private validate(cursor: CursorPayload): CursorPayload | null {
    if (
      cursor.sort !== this.sort ||
      cursor.sortDirection !== this.sortDirection
    ) {
      return null
    }
    return cursor
  }
}
