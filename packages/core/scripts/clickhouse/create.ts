import path from 'path'
import { spawnSync } from 'child_process'
import { coreDir, ensureMigrateInstalled } from './helpers'

function runCreate(dir: string, migrationName: string) {
  const result = spawnSync(
    'migrate',
    [
      'create',
      '-ext',
      'sql',
      '-dir',
      dir,
      '-seq',
      '-digits',
      '4',
      migrationName,
    ],
    { stdio: 'inherit' },
  )

  if (result.status === 0) return

  if (typeof result.status === 'number') {
    process.exit(result.status)
  }

  throw new Error('Failed to create migration files')
}

function main() {
  ensureMigrateInstalled()

  const migrationName = process.argv[2]
  if (!migrationName) {
    throw new Error(
      'Migration name is required. Usage: pnpm ch:create <migration_name>',
    )
  }

  const unclusteredDir = path.join(coreDir, 'clickhouse/migrations/unclustered')
  const clusteredDir = path.join(coreDir, 'clickhouse/migrations/clustered')

  console.log(`Creating migration: ${migrationName}`)
  console.log('')
  console.log('Unclustered migrations:')
  runCreate(unclusteredDir, migrationName)
  console.log('')
  console.log('Clustered migrations:')
  runCreate(clusteredDir, migrationName)
}

main()
