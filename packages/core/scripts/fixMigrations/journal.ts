import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Journal, JournalEntry, AppliedMigrationRow } from './types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  return BigInt(value)
}

export function loadJournal(): Journal {
  const journalPath = join(__dirname, '../../drizzle/meta/_journal.json')
  const journalContent = readFileSync(journalPath, 'utf-8')
  return JSON.parse(journalContent) as Journal
}

export function getUnappliedMigrations(
  journal: Journal,
  appliedMigrations: AppliedMigrationRow[],
): { unapplied: JournalEntry[]; maxCreatedAt: bigint } {
  const appliedTimestamps = new Set<bigint>(
    appliedMigrations.map((m) => toBigInt(m.created_at)),
  )

  const unapplied = journal.entries.filter(
    (entry) => !appliedTimestamps.has(BigInt(entry.when)),
  )

  const maxCreatedAt =
    appliedMigrations.length > 0
      ? toBigInt(appliedMigrations[appliedMigrations.length - 1].created_at)
      : BigInt(0)

  return { unapplied, maxCreatedAt }
}

export function getMigrationPath(migrationTag: string): string {
  return join(__dirname, '../../drizzle', `${migrationTag}.sql`)
}
