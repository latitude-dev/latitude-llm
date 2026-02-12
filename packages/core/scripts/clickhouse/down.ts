import {
  assertClusterNotEnabled,
  buildMigrationDatabaseUrl,
  ensureMigrateInstalled,
  ensureMigrationsExist,
  resolveMigrationsDir,
  runMigrate,
} from './helpers'

function main() {
  assertClusterNotEnabled()
  ensureMigrateInstalled()

  const migrationsDir = resolveMigrationsDir()
  ensureMigrationsExist(migrationsDir)

  const databaseUrl = buildMigrationDatabaseUrl()
  const requested = process.argv[2] ?? '1'

  if (requested === 'all') {
    runMigrate([
      '-source',
      `file://${migrationsDir}`,
      '-database',
      databaseUrl,
      'down',
      '-all',
    ])
    return
  }

  runMigrate([
    '-source',
    `file://${migrationsDir}`,
    '-database',
    databaseUrl,
    'down',
    requested,
  ])
}

main()
