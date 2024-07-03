import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import * as schema from '../schema'

const { Pool } = pg

export type Database = NodePgDatabase<typeof schema>
export function buildDatabaseClient({
  connectionString,
}: {
  connectionString: string
}): Database {
  const pool = new Pool({ connectionString })
  return drizzle(pool, { schema })
}
