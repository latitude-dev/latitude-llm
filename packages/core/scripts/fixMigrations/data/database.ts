import crypto from 'crypto'

import { sql } from 'drizzle-orm'

import { database } from '../../../src/client'
import type { AppliedMigrationRow, Migration, OperationResult } from '../types'

/**
 * Compute MD5 hash of migration SQL content (matches drizzle-kit format)
 */
function computeMigrationHash(sqlContent: string): string {
  return crypto.createHash('md5').update(sqlContent).digest('hex')
}

/**
 * Fetch all applied migrations from the database
 */
export async function getAppliedMigrations(): Promise<AppliedMigrationRow[]> {
  const result = await database.execute<AppliedMigrationRow>(
    sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
  )
  return result.rows
}

/**
 * Execute raw SQL from a migration
 */
export async function executeMigrationSql(
  sqlContent: string,
): Promise<OperationResult> {
  try {
    await database.execute(sql.raw(sqlContent))
    return { success: true }
  } catch (error) {
    const err = error as Error
    return { success: false, error: err.message || String(error) }
  }
}

/**
 * Mark a migration as applied in the database
 * Computes MD5 hash of SQL content to match drizzle-kit format
 */
export async function markMigrationApplied(
  migration: Migration,
): Promise<OperationResult> {
  try {
    const timestamp = migration.createdAt.getTime()
    const hash = computeMigrationHash(migration.sql)
    await database.execute(
      sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${timestamp})`,
    )
    return { success: true }
  } catch (error) {
    const err = error as Error
    return { success: false, error: err.message || String(error) }
  }
}

/**
 * Remove a migration from the applied list in the database
 * Deletes by created_at timestamp since that's how we identify applied migrations
 */
export async function unmarkMigrationApplied(
  migration: Migration,
): Promise<OperationResult> {
  try {
    const timestamp = migration.createdAt.getTime()
    await database.execute(
      sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${timestamp}`,
    )
    return { success: true }
  } catch (error) {
    const err = error as Error
    return { success: false, error: err.message || String(error) }
  }
}
