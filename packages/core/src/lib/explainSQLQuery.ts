import { SQLWrapper, sql } from 'drizzle-orm'
import { Database } from '../client'

/**
 * Use this to explain analyze a SQL query
 * for a PostgreSQL database.
 */
export const explainSQLQuery = async <T extends SQLWrapper>(
  db: Database,
  query: T,
) => {
  const debugResult = await db.execute(sql`EXPLAIN ANALYZE ${query.getSQL()}`)
  console.debug(debugResult)
  return query
}
