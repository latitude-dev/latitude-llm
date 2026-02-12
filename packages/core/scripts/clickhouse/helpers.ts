import { env } from '@latitude-data/env'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const coreDir = path.resolve(__dirname, '../..')

export function isClusterEnabled() {
  return env.CLICKHOUSE_CLUSTER_ENABLED === 'true'
}

export function resolveMigrationsDir() {
  if (isClusterEnabled()) {
    return path.join(coreDir, 'clickhouse/migrations/clustered')
  }

  return path.join(coreDir, 'clickhouse/migrations/unclustered')
}

export function ensureMigrateInstalled() {
  const result = spawnSync('migrate', ['-version'], {
    stdio: 'ignore',
  })

  if (result.status === 0) return

  throw new Error(
    "golang-migrate is not installed or not in PATH. Install it with 'brew install golang-migrate'",
  )
}

export function ensureMigrationsExist(migrationsDir: string) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`)
  }

  const hasSqlFiles = fs
    .readdirSync(migrationsDir)
    .some((file) => file.endsWith('.sql'))

  if (!hasSqlFiles) {
    throw new Error(`No migrations found in ${migrationsDir}`)
  }
}

export function assertClusterNotEnabled() {
  if (!isClusterEnabled()) return

  throw new Error(
    'Cluster mode is not yet supported. Set CLICKHOUSE_CLUSTER_ENABLED=false',
  )
}

export function buildMigrationDatabaseUrl() {
  const migrationUrl = new URL(env.CLICKHOUSE_MIGRATION_URL)

  migrationUrl.searchParams.set('username', env.CLICKHOUSE_USER)
  migrationUrl.searchParams.set('password', env.CLICKHOUSE_PASSWORD)
  migrationUrl.searchParams.set('database', env.CLICKHOUSE_DB)
  migrationUrl.searchParams.set('x-multi-statement', 'true')

  if (env.CLICKHOUSE_MIGRATION_SSL === 'true') {
    migrationUrl.searchParams.set('secure', 'true')
    migrationUrl.searchParams.set('skip_verify', 'true')
  }

  if (isClusterEnabled()) {
    migrationUrl.searchParams.set('x-cluster-name', env.CLICKHOUSE_CLUSTER_NAME)
    migrationUrl.searchParams.set(
      'x-migrations-table-engine',
      'ReplicatedMergeTree',
    )
  } else {
    migrationUrl.searchParams.set('x-migrations-table-engine', 'MergeTree')
  }

  return migrationUrl.toString()
}

export function runMigrate(args: string[]) {
  const result = spawnSync('migrate', args, {
    stdio: 'inherit',
  })

  if (result.status === 0) return

  if (typeof result.status === 'number') {
    process.exit(result.status)
  }

  throw new Error('Failed to execute migrate command')
}
