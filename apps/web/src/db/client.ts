import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import * as schema from './schema'

const { Pool } = pg

const testEnv = process.env.NODE_ENV === 'test'
const connectionString = testEnv
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL

const pool = new Pool({ connectionString })
const db = drizzle(pool, { schema })

export default db
