import type { Migration, OperationResult } from '../types'
import { executeMigrationSql, markMigrationApplied } from '../data'

/**
 * Run a migration's SQL and optionally mark it as applied
 */
export async function runMigration(
  migration: Migration,
): Promise<OperationResult> {
  // Execute the SQL
  const executeResult = await executeMigrationSql(migration.sql)

  if (!executeResult.success) {
    return executeResult
  }

  // If not already applied, mark it as applied
  if (!migration.isApplied) {
    const markResult = await markMigrationApplied(migration)
    if (!markResult.success) {
      return markResult
    }
  }

  return { success: true, message: 'Migration executed successfully' }
}
