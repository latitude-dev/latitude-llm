#!/usr/bin/env tsx

import { database } from '../src/client'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { sql } from 'drizzle-orm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

type JournalEntry = {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

type Journal = {
  version: string
  dialect: string
  entries: JournalEntry[]
}

// Terminal color codes
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

/**
 * Script to check for unapplied migrations by comparing the journal.json
 * with the actual migrations applied in the database.
 *
 * Usage: tsx scripts/checkUnappliedMigrations.ts
 */
async function main() {
  console.log('🔍 Checking for unapplied migrations...\n')

  try {
    // Read the journal.json file
    const journalPath = join(__dirname, '../drizzle/meta/_journal.json')
    const journalContent = readFileSync(journalPath, 'utf-8')
    const journal: Journal = JSON.parse(journalContent)

    // Query the database for applied migrations
    const appliedMigrationsResult = await database.execute(
      sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC`,
    )

    const appliedMigrations = appliedMigrationsResult.rows as Array<{
      id: number
      hash: string
      created_at: string
    }>

    // Get the latest created_at value from the database
    const maxCreatedAt =
      appliedMigrations.length > 0
        ? BigInt(appliedMigrations[appliedMigrations.length - 1].created_at)
        : BigInt(0)

    // Create a Set of applied migration timestamps for fast lookup
    const appliedTimestamps = new Set(
      appliedMigrations.map((m) => BigInt(m.created_at)),
    )

    // Find unapplied migrations
    const unappliedMigrations = journal.entries.filter(
      (entry) => !appliedTimestamps.has(BigInt(entry.when)),
    )

    if (unappliedMigrations.length === 0) {
      console.log('✅ All migrations from journal.json have been applied!')
      process.exit(0)
    }

    // Display unapplied migrations with color coding
    console.log(`Found ${unappliedMigrations.length} unapplied migration(s):\n`)

    unappliedMigrations.forEach((migration) => {
      const date = new Date(migration.when)
      const formattedDate = date.toISOString().split('T')[0].replace(/-/g, '/')
      const willBeApplied = migration.when > Number(maxCreatedAt)
      const color = willBeApplied ? GREEN : RED
      const name = migration.tag

      console.log(`${formattedDate} ${color}${name}${RESET}`)
    })

    const willApplyCount = unappliedMigrations.filter(
      (m) => m.when > Number(maxCreatedAt),
    ).length

    console.log(
      `\n💡 ${willApplyCount} migration(s) ${GREEN}will be applied${RESET} when running db:migrate`,
    )
    console.log(
      `   ${unappliedMigrations.length - willApplyCount} migration(s) ${RED}will be skipped${RESET} (timestamp <= latest applied)`,
    )

    process.exit(1)
  } catch (error) {
    console.error('❌ Error checking migrations:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
