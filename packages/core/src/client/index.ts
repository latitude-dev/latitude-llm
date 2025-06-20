import { env } from '@latitude-data/env'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import { PgWithReplicas, withReplicas } from 'drizzle-orm/pg-core'
import type { Pool as IPool, PoolConfig } from 'pg'
import * as schema from '../schema'

const { Pool } = pg

export type Replica = NodePgDatabase<typeof schema> & { $client: IPool }
export type Database = PgWithReplicas<Replica>

// TODO: Send pool vitals to datadog when they change
const POOL_CONFIG: PoolConfig = {
  max: 10, // Maximum number of connections in the pool (default)
  min: 0, // Minimum number of connections in the pool (default)
  idleTimeoutMillis: 30000, // 30 seconds - Idle connection timeout (pool)
  idle_in_transaction_session_timeout: 1800000, // 30 minutes - Idle connection timeout (database)
  statement_timeout: 30000, // 30 seconds - Running statement timeout (database)
}

const pool = new Pool({
  ...POOL_CONFIG,
  connectionString: env.DATABASE_URL,
})

const read1Pool = new Pool({
  ...POOL_CONFIG,
  connectionString: env.READ_DATABASE_URL,
})

const read2Pool = new Pool({
  ...POOL_CONFIG,
  connectionString: env.READ_2_DATABASE_URL,
})

export * as utils from './utils'

const primary = drizzle(pool, { schema })
const read1 = drizzle(read1Pool, { schema })
const read2 = drizzle(read2Pool, { schema })

export const database = withReplicas(primary, [read1, read2])

const LRO_POOL_CONFIG: PoolConfig = {
  ...POOL_CONFIG,
  max: 3, // Don't saturate connections
  min: 0, // Don't reserve connections
  idleTimeoutMillis: 1, // Kick idle connections as fast as possible
  statement_timeout: 300000, // 5 minutes - Increase x5 the statement timeout
}

let _lro:
  | {
      pools: IPool[]
      replicas: Replica[]
      database: Database
    }
  | undefined

export function lro() {
  if (_lro?.database) return _lro.database
  throw new Error('LRO database not initialized')
}

export function setupLRO() {
  if (_lro) return

  const pools = [
    new Pool({
      ...LRO_POOL_CONFIG,
      connectionString: env.READ_DATABASE_URL,
    }),
    new Pool({
      ...LRO_POOL_CONFIG,
      connectionString: env.READ_2_DATABASE_URL,
    }),
  ]
  const replicas = pools.map((pool) => drizzle(pool, { schema }))
  const database = withReplicas(primary, replicas as [Replica, ...Replica[]])

  _lro = { pools, replicas, database }
}
