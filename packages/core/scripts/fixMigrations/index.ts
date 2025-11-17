#!/usr/bin/env tsx

import { database } from '../../src/client'
import { sql } from 'drizzle-orm'
import { log } from './logger'
import { loadJournal, getUnappliedMigrations } from './journal'
import { promptAndRunOne } from './menu'
import type { AppliedMigrationRow } from './types'

/**
 * Script to check for unapplied migrations by comparing the journal.json
 * with the actual migrations applied in the database.
 *
 * Usage: tsx scripts/fixMigrations/index.ts
 */
async function main(): Promise<number> {
  log.info('🔍 Checking for unapplied migrations...\n')

  try {
    const journal = loadJournal()

    const appliedMigrationsResult = await database.execute(
      sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC`,
    )
    const appliedMigrations =
      appliedMigrationsResult.rows as AppliedMigrationRow[]

    let { unapplied: unappliedMigrations, maxCreatedAt } =
      getUnappliedMigrations(journal, appliedMigrations)

    if (unappliedMigrations.length === 0) {
      log.success('✅ All migrations are correctly applied!')
      return 0
    }

    while (true) {
      const result = await promptAndRunOne(unappliedMigrations, maxCreatedAt)

      if (result.type === 'exit') {
        return result.code
      }

      if (result.type === 'back') {
        // This shouldn't happen at the top level, but handle it gracefully
        continue
      }

      const freshAppliedResult = await database.execute(
        sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC`,
      )
      const freshApplied = freshAppliedResult.rows as AppliedMigrationRow[]
      const refreshed = getUnappliedMigrations(journal, freshApplied)

      unappliedMigrations = refreshed.unapplied
      maxCreatedAt = refreshed.maxCreatedAt

      if (unappliedMigrations.length === 0) {
        log.success('✅ All migrations are now applied!')
        return 0
      }

      console.log('\n')
    }
  } catch (error) {
    log.error('❌ Error checking migrations:')
    console.error(error)
    return 1
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  })
