import { readFileSync } from 'fs'
import { spawn } from 'child_process'
import { sql } from 'drizzle-orm'
import { database } from '../../src/client'
import { log } from './logger'
import { getMigrationPath } from './journal'
import type { JournalEntry } from './types'

export async function runMigration(migration: JournalEntry): Promise<boolean> {
  log.info(`\nRunning migration: ${migration.tag}`)

  try {
    const migrationFile = getMigrationPath(migration.tag)
    const migrationSQL = readFileSync(migrationFile, 'utf-8')

    log.warn('\nExecuting SQL:')
    console.log(migrationSQL)
    console.log('')

    await database.execute(sql.raw(migrationSQL))

    await database.execute(
      sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migration.tag}, ${migration.when})`,
    )

    log.success('✓ Migration applied successfully!\n')
    return true
  } catch (error) {
    log.error('✗ Migration failed:')
    console.error(error)
    return false
  }
}

export async function markAsExecuted(
  migration: JournalEntry,
): Promise<boolean> {
  log.info(`\nMarking migration as executed: ${migration.tag}`)

  try {
    await database.execute(
      sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migration.tag}, ${migration.when})`,
    )

    log.success('✓ Migration marked as executed!\n')
    return true
  } catch (error) {
    log.error('✗ Failed to mark migration as executed:')
    console.error(error)
    return false
  }
}

export function openMigrationInEditor(migration: JournalEntry): void {
  const migrationFile = getMigrationPath(migration.tag)

  log.info(`\nOpening ${migration.tag} in default editor...`)

  // Use the appropriate command based on the platform
  const command = process.platform === 'win32' ? 'start' : 'open'
  const args =
    process.platform === 'win32' ? ['', migrationFile] : [migrationFile]

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })

  child.unref()
  log.success('✓ File opened!\n')
}

export function readMigrationSQL(migration: JournalEntry): string {
  const migrationFile = getMigrationPath(migration.tag)
  return readFileSync(migrationFile, 'utf-8')
}
