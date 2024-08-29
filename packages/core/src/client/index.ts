import { env } from '@latitude-data/env'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import * as schema from '../schema'

const { Pool } = pg

export type Database = NodePgDatabase<typeof schema>

const pool = new Pool({
  connectionString: env.DATABASE_URL,
})
export const database = drizzle(pool, { schema })
