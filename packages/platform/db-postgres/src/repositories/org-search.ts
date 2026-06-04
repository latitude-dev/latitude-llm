import { type AnyColumn, desc, type SQL, sql } from "drizzle-orm"

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

/**
 * Leading `ORDER BY` term(s) that float results from `preferProjectId` ahead of the rest, so that
 * when the Command Palette is opened from inside a project that project's results come first. Spread
 * into `orderBy(...)` before the relevance/recency terms. Returns an empty list (no-op) when no
 * project is preferred — e.g. the palette is opened outside any project.
 */
export const preferProjectFirst = (projectColumn: AnyColumn, preferProjectId: string | undefined): SQL[] =>
  preferProjectId ? [desc(sql<boolean>`(${projectColumn} = ${preferProjectId})`)] : []
