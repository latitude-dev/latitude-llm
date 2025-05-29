import { env } from '@latitude-data/env'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as drizzleDbUtils from './utils'
import pg from 'pg'

import * as schema from '../schema'
import { PgWithReplicas, withReplicas } from 'drizzle-orm/pg-core'
import type { Pool as IPool } from 'pg'

const { Pool } = pg

export type Database = PgWithReplicas<
  NodePgDatabase<typeof schema> & { $client: IPool }
>

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  idle_in_transaction_session_timeout: 1800000, // 30 minutes
  statement_timeout: 30000, // 30 seconds
})

const readPool = new Pool({
  connectionString: env.READ_DATABASE_URL,
  idle_in_transaction_session_timeout: 1800000, // 30 minutes
  statement_timeout: 30000, // 30 seconds
})

export const dbUtils = drizzleDbUtils

const primary = drizzle(pool, { schema })
const read1 = drizzle(readPool, { schema })

export const database = withReplicas(primary, [read1])
