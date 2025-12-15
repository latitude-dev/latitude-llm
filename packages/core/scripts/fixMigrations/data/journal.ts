import fs from 'fs'
import path from 'path'

import type { Journal, JournalEntry } from '../types'

const DRIZZLE_FOLDER = 'drizzle'
const JOURNAL_PATH = 'meta/_journal.json'

/**
 * Get the path to the drizzle migrations folder
 */
export function getDrizzleFolder(): string {
  return path.join(process.cwd(), DRIZZLE_FOLDER)
}

/**
 * Get the path to a specific migration SQL file
 */
export function getMigrationPath(tag: string): string {
  return path.join(getDrizzleFolder(), `${tag}.sql`)
}

/**
 * Load the journal file containing all migration entries
 */
export function loadJournal(): Journal {
  const journalPath = path.join(getDrizzleFolder(), JOURNAL_PATH)
  const content = fs.readFileSync(journalPath, 'utf-8')
  return JSON.parse(content) as Journal
}

/**
 * Read the SQL content of a migration file
 */
export function readMigrationSql(entry: JournalEntry): string {
  const sqlPath = getMigrationPath(entry.tag)

  if (!fs.existsSync(sqlPath)) {
    return '-- SQL file not found'
  }

  return fs.readFileSync(sqlPath, 'utf-8')
}
