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
  runMigrate([
    '-source',
    `file://${migrationsDir}`,
    '-database',
    databaseUrl,
    'drop',
  ])
}

main()
