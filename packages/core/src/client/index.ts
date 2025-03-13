import { env } from '@latitude-data/env'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as drizzleDbUtils from './utils'
import pg from 'pg'

import * as schema from '../schema'

const { Pool } = pg

export type Database = NodePgDatabase<typeof schema>

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  idle_in_transaction_session_timeout: 1800000, // 30 minutes
  statement_timeout: 30000, // 30 seconds
})

export const dbUtils = drizzleDbUtils
export const database = drizzle(pool, { schema })
