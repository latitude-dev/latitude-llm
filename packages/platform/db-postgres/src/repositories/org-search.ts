import { type AnyColumn, type SQL, sql } from "drizzle-orm"

/**
 * Relevance score for an org-wide name search, used to order Command Palette results: exact name
 * match (3) > name starts with the query (2) > substring match (1). Callers order by this DESC and
 * then by recency, so the best name match leads and ties fall back to newest-first. Mirrors the
 * `ILIKE %query%` filter the searches apply, so every returned row scores at least 1.
 */
export const nameMatchScore = (column: AnyColumn, query: string): SQL<number> =>
  sql<number>`case
    when lower(${column}) = lower(${query}) then 3
    when ${column} ilike ${`${query}%`} then 2
    else 1
  end`
