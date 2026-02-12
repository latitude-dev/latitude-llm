import fs from 'fs'
import path from 'path'
import { createClient } from '@clickhouse/client'
import { env } from '@latitude-data/env'
import { assertClusterNotEnabled, resolveMigrationsDir } from './helpers'

type SchemaMigrationRow = {
  version: number
  dirty: number
}

type MigrationFile = {
  version: number
  name: string
}

function readMigrationFiles(migrationsDir: string) {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.up.sql'))
    .sort()
    .map((file) => {
      const [versionToken, ...rest] = file.split('_')
      const version = Number.parseInt(versionToken ?? '0', 10)
      const name = rest.join('_').replace(/\.up\.sql$/, '')

      return {
        version: Number.isNaN(version) ? 0 : version,
        name,
      } satisfies MigrationFile
    })
}

async function readSchemaMigrationStatus() {
  const client = createClient({
    url: env.CLICKHOUSE_URL,
    database: env.CLICKHOUSE_DB,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
  })

  try {
    const result = await client.query({
      query:
        'SELECT version, dirty FROM schema_migrations ORDER BY sequence DESC LIMIT 1',
      format: 'JSONEachRow',
    })

    const rows = await result.json<SchemaMigrationRow>()
    const current = rows[0]

    if (!current) {
      return { currentVersion: 0, dirty: false }
    }

    return {
      currentVersion: current.version > 0 ? current.version : 0,
      dirty: current.dirty === 1,
    }
  } catch {
    return { currentVersion: 0, dirty: false }
  } finally {
    await client.close()
  }
}

function printStatusHeader(currentVersion: number, dirty: boolean) {
  console.log('')
  console.log('ClickHouse Migrations Status')
  console.log('============================')
  console.log('')
  console.log('Mode:            unclustered')
  console.log(`Database:        ${env.CLICKHOUSE_DB}`)
  console.log(`Current version: ${currentVersion}`)
  console.log(`Dirty:           ${dirty ? 'YES (needs manual fix)' : 'no'}`)
  console.log('')
  console.log('Migrations:')
  console.log('-----------')
  console.log('VERSION  NAME                                     STATUS')
  console.log('-------  ----                                     ------')
}

function printMigrationRows(
  migrations: MigrationFile[],
  currentVersion: number,
) {
  for (const migration of migrations) {
    const status = migration.version <= currentVersion ? 'applied' : 'pending'
    const versionColumn = String(migration.version).padEnd(7, ' ')
    const nameColumn = migration.name.padEnd(40, ' ')
    console.log(`${versionColumn}  ${nameColumn} ${status}`)
  }

  console.log('')
}

async function main() {
  assertClusterNotEnabled()

  const migrationsDir = resolveMigrationsDir()
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`)
  }

  const migrations = readMigrationFiles(migrationsDir)
  const { currentVersion, dirty } = await readSchemaMigrationStatus()

  printStatusHeader(currentVersion, dirty)
  printMigrationRows(migrations, currentVersion)
}

main()
