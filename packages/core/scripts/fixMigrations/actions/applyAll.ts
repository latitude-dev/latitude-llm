import chalk from 'chalk'

import type { Migration } from '../types'
import {
  sortByDateAsc,
  executeMigrationSql,
  markMigrationApplied,
} from '../data'

/**
 * Apply all unapplied migrations in order (oldest first)
 */
export async function applyAllMigrations(
  migrations: Migration[],
): Promise<void> {
  const unapplied = migrations.filter((m) => !m.isApplied)

  if (unapplied.length === 0) {
    console.log(chalk.green('\n✅ All migrations are already applied!\n'))
    return
  }

  // Sort by creation date (oldest first)
  const sorted = sortByDateAsc(unapplied)

  console.log(chalk.cyan(`\n▶ Applying ${sorted.length} migration(s)...\n`))

  for (const migration of sorted) {
    process.stdout.write(chalk.dim(`  ${migration.name}... `))

    // Execute SQL
    const executeResult = await executeMigrationSql(migration.sql)
    if (!executeResult.success) {
      console.log(chalk.red('✗'))
      console.error(chalk.red(`\nError applying ${migration.name}:`))
      console.error(executeResult.error)
      process.exit(1)
    }

    // Mark as applied
    const markResult = await markMigrationApplied(migration)
    if (!markResult.success) {
      console.log(chalk.red('✗'))
      console.error(chalk.red(`\nError marking ${migration.name} as applied:`))
      console.error(markResult.error)
      process.exit(1)
    }

    console.log(chalk.green('✓'))
  }

  console.log(
    chalk.green(`\n✅ Successfully applied ${sorted.length} migration(s)!\n`),
  )
}
