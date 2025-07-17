import { env } from '@latitude-data/env'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import { PgWithReplicas, withReplicas } from 'drizzle-orm/pg-core'
import type { Pool as IPool, PoolConfig } from 'pg'
import * as schema from '../schema'

const { Pool } = pg

type Connection = NodePgDatabase<typeof schema> & { $client: IPool }
export type Database = Connection | PgWithReplicas<Connection>

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

const readReplicas: Connection[] = []

if (env.READ_DATABASE_URL) {
  const read1Pool = new Pool({
    ...POOL_CONFIG,
    connectionString: env.READ_DATABASE_URL,
  })
  readReplicas.push(drizzle(read1Pool, { schema }))
}

if (env.READ_2_DATABASE_URL) {
  const read2Pool = new Pool({
    ...POOL_CONFIG,
    connectionString: env.READ_2_DATABASE_URL,
  })
  readReplicas.push(drizzle(read2Pool, { schema }))
}

export * as utils from './utils'

const primary = drizzle(pool, { schema })

export const database =
  readReplicas.length > 0
    ? withReplicas(primary, readReplicas as [Connection, ...Connection[]])
    : primary

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
      replicas: Connection[]
      database: Database
    }
  | undefined

export function lro() {
  if (_lro?.database) return _lro.database
  throw new Error('LRO database not initialized')
}

export function setupLRO() {
  if (_lro) return

  const pools: IPool[] = []
  const replicas: Connection[] = []

  if (env.READ_DATABASE_URL) {
    const pool = new Pool({
      ...LRO_POOL_CONFIG,
      connectionString: env.READ_DATABASE_URL,
    })
    pools.push(pool)
    replicas.push(drizzle(pool, { schema }))
  }

  if (env.READ_2_DATABASE_URL) {
    const pool = new Pool({
      ...LRO_POOL_CONFIG,
      connectionString: env.READ_2_DATABASE_URL,
    })
    pools.push(pool)
    replicas.push(drizzle(pool, { schema }))
  }

  const database =
    replicas.length > 0
      ? withReplicas(primary, replicas as [Connection, ...Connection[]])
      : primary

  _lro = { pools, replicas, database }
}
