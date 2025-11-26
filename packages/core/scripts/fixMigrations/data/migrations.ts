import type { AppliedMigrationRow, Journal, Migration } from '../types'
import { loadJournal, readMigrationSql } from './journal'
import { getAppliedMigrations } from './database'

/**
 * Build a set of timestamps for applied migrations
 */
function buildAppliedTimestampSet(
  appliedRows: AppliedMigrationRow[],
): Set<number> {
  const timestamps = new Set<number>()
  for (const row of appliedRows) {
    timestamps.add(Number(row.created_at))
  }
  return timestamps
}

/**
 * Convert journal entries to Migration objects with status
 */
function journalToMigrations(
  journal: Journal,
  appliedTimestamps: Set<number>,
): Migration[] {
  return journal.entries.map((entry) => {
    const isApplied = appliedTimestamps.has(entry.when)

    return {
      name: entry.tag,
      fileName: `${entry.tag}.sql`,
      sql: readMigrationSql(entry),
      createdAt: new Date(entry.when),
      appliedAt: isApplied ? new Date(entry.when) : null,
      isApplied,
    }
  })
}

/**
 * Load all migrations with their applied status
 */
export async function getMigrations(): Promise<Migration[]> {
  const journal = loadJournal()
  const appliedRows = await getAppliedMigrations()
  const appliedTimestamps = buildAppliedTimestampSet(appliedRows)

  return journalToMigrations(journal, appliedTimestamps)
}

/**
 * Filter to only unapplied migrations
 */
export function filterUnapplied(migrations: Migration[]): Migration[] {
  return migrations.filter((m) => !m.isApplied)
}

/**
 * Filter to only applied migrations
 */
export function filterApplied(migrations: Migration[]): Migration[] {
  return migrations.filter((m) => m.isApplied)
}

/**
 * Sort migrations by creation date (oldest first)
 */
export function sortByDateAsc(migrations: Migration[]): Migration[] {
  return [...migrations].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )
}

/**
 * Find migrations that can't be auto-applied (older than last applied)
 */
export function findOutOfOrderMigrations(migrations: Migration[]): Migration[] {
  const applied = filterApplied(migrations)
  const unapplied = filterUnapplied(migrations)

  if (applied.length === 0) {
    return []
  }

  const lastAppliedTimestamp = Math.max(
    ...applied.map((m) => m.createdAt.getTime()),
  )

  return unapplied.filter((m) => m.createdAt.getTime() <= lastAppliedTimestamp)
}
